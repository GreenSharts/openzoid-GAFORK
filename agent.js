// openzoid AI agent — single-file build.
//
// Load this after ui-*.js and before clipmaker-*.js:
//   <script src="./agent.js"></script>
//
// Three parts, each self-contained:
//   1. PZ.agent.tools   — typed tool surface over the editor's undoable commands
//   2. PZ.agent.client  — the agent loop, one adapter per model provider
//   3. PZ.ui.agent      — the chat panel
//
// See the README for setup. Sources are kept concatenated here rather than in
// separate files so the whole feature is one drop-in file with no new folder.


// ============================================================================
// agent/tools.js
// ============================================================================

// PZ.agent.tools — a typed tool surface over the editor's undoable command layer.
//
// Nothing here touches the scene graph directly. Every mutation goes through
// PZ.ui.properties / PZ.ui.edit / PZ.ui.timeline.tracks so it lands in the undo
// history, and the whole of one agent turn is wrapped in a single
// history.startOperation()/finishOperation() pair by PZ.agent.tools.runTurn.
// That is what makes an agent action revertible with one ctrl+Z.

var PZ = PZ || {};
PZ.agent = PZ.agent || {};

(function () {
    "use strict";

    let editor = null;
    let viewport = null;
    let propertyOps = null;
    let trackOps = null;

    // The tracks command functions (createClip/deleteClip) are written against a
    // PZ.ui.timeline.tracks instance and read this.timeline.sequence,
    // this.timeline.editor and this.sequence. This shim supplies those lazily so
    // it stays correct across project loads, and lets the real timeline update
    // itself through the sequence's onClipCreated/onClipDeleted observables.
    function makeTrackOps() {
        return {
            get sequence() {
                return editor.sequence;
            },
            get timeline() {
                return {
                    get sequence() {
                        return editor.sequence;
                    },
                    editor: editor,
                };
            },
            updateSequenceLength: PZ.ui.timeline.tracks.prototype.updateSequenceLength,
            createClip: PZ.ui.timeline.tracks.prototype.createClip,
            deleteClip: PZ.ui.timeline.tracks.prototype.deleteClip,
            createTrack: PZ.ui.timeline.tracks.prototype.createTrack,
        };
    }

    PZ.agent.attach = function (ed, refs) {
        editor = ed;
        viewport = refs && refs.viewport;
        propertyOps = new PZ.ui.properties(ed);
        trackOps = makeTrackOps();
    };

    PZ.agent.isAttached = function () {
        return !!editor;
    };

    // ---------------------------------------------------------------- layers

    // PZ.layer.create() indexes this list, so the numbers are the on-disk layer
    // type. Templates mirror CM.defaultProject, which is the authoritative shape.
    const LAYER_KINDS = {
        scene: { type: 4, name: "Scene", object: { type: 4, effects: [], objects: [{ type: 6, objectType: 1 }] } },
        text: { type: 7, name: "Text", object: { type: 7, objects: [], effects: [] } },
        shape: { type: 8, name: "Shape", object: { type: 8, objects: [], effects: [] } },
        path: { type: 6, name: "Shape", object: { type: 6, objects: [], effects: [] } },
        image: { type: 3, name: "Image", object: { type: 3, effects: [] } },
        adjustment: { type: 1, name: "Adjustment", object: { type: 1, effects: [] } },
        composite: { type: 2, name: "Composite", object: { type: 2, objects: [], effects: [] } },
    };

    function layerId(trackIdx, clipIdx) {
        return "v" + trackIdx + ":" + clipIdx;
    }

    function resolveClip(id) {
        let m = /^v(\d+):(\d+)$/.exec(String(id || ""));
        if (!m) throw new Error("Bad layer id '" + id + "'. Expected the form v0:1 (video track : clip index).");
        let track = editor.sequence.videoTracks[+m[1]];
        if (!track) throw new Error("No video track " + m[1] + ".");
        let clip = track.clips[+m[2]];
        if (!clip) throw new Error("No clip " + m[2] + " on video track " + m[1] + ".");
        return clip;
    }

    function resolveLayer(id) {
        return resolveClip(id).object;
    }

    function kindOfLayer(layer) {
        for (let key of Object.keys(LAYER_KINDS)) {
            if (LAYER_KINDS[key].type === layer.type) return key;
        }
        return "layer";
    }

    // ------------------------------------------------------------ properties

    // Property paths are dot-separated keys into layer.properties, e.g.
    // "opacity", "position", "childProperties.text". Text/shape sub-properties
    // live under childProperties, so a bare "text" is resolved there as a
    // convenience — the agent does not have to know the nesting.
    function resolveProperty(layer, path) {
        let parts = String(path).split(".");
        let node = layer.properties;
        if (!(parts[0] in node) && node.childProperties && parts[0] in node.childProperties) {
            node = node.childProperties;
        }
        for (let part of parts) {
            if (!node || !(part in node)) {
                throw new Error(
                    "No property '" + path + "' on this layer. Call describe_layer to see what it has."
                );
            }
            node = node[part];
        }
        if (node instanceof PZ.propertyList) {
            throw new Error("'" + path + "' is a group of properties, not a value. Name one of its children.");
        }
        return node;
    }

    const TYPE_NAMES = {
        0: "number",
        1: "vector2",
        2: "vector3",
        3: "vector4",
        4: "color",
        5: "gradient",
        6: "option",
        7: "text",
        8: "asset",
        9: "list",
        10: "curve",
        11: "shader",
    };

    function describeProperty(prop, key, out, prefix) {
        let path = prefix ? prefix + "." + key : key;
        if (prop instanceof PZ.propertyList) {
            for (let childKey of Object.keys(prop)) {
                describeProperty(prop[childKey], childKey, out, path === "childProperties" ? "" : path);
            }
            return;
        }
        if (!(prop instanceof PZ.property)) return;
        let def = prop.definition || {};
        let entry = {
            path: path,
            name: def.name || key,
            type: TYPE_NAMES[def.type] !== undefined ? TYPE_NAMES[def.type] : def.type,
            animated: !!prop.animated,
        };
        try {
            let v = prop.get(0);
            entry.value = Array.isArray(v) ? v.slice() : v;
        } catch (e) {
            entry.value = null;
        }
        if (prop.expression) entry.expression = prop.expression.source;
        if (def.items) entry.options = def.items;
        if (def.min !== undefined) entry.min = def.min;
        if (def.max !== undefined) entry.max = def.max;
        if (prop.keyframes && prop.animated) {
            entry.keyframes = prop.keyframes.map((k) => ({ frame: k.frame, value: k.value, tween: k.tween }));
        }
        out.push(entry);
    }

    // Providers differ in how faithfully they preserve value types: Gemini's
    // schema dialect has no "any" type, so numbers and arrays arrive as
    // strings. Coerce using the property's own declared type rather than
    // guessing from the value, so the text "123" stays text on a text property.
    function coerceValue(prop, value) {
        if (typeof value !== "string") return value;
        let type = prop.definition ? prop.definition.type : undefined;
        let T = PZ.property.type;
        if (type === T.TEXT || type === T.LIST || type === T.ASSET || type === T.SHADER) return value;
        try {
            let parsed = JSON.parse(value);
            return typeof parsed === "object" || typeof parsed === "number" || typeof parsed === "boolean" ? parsed : value;
        } catch (e) {
            return value;
        }
    }

    // A group property (position, scale, colour) holds one scalar child per
    // component, and keyframes live on the children rather than the group.
    function keyframeTargets(prop) {
        if (prop instanceof PZ.property.dynamic.group) return Array.prototype.slice.call(prop.objects);
        return [prop];
    }

    function componentValue(value, prop, index, isGroup) {
        if (!isGroup) return value;
        if (!Array.isArray(value)) {
            throw new Error("'" + (prop.definition && prop.definition.name) + "' needs an array value, one per component.");
        }
        return value[index];
    }

    // ----------------------------------------------------------- tool bodies

    const impl = {
        get_project() {
            let seq = editor.sequence;
            let res = seq.properties.resolution.get();
            let tracks = [];
            for (let t = 0; t < seq.videoTracks.length; t++) {
                let clips = seq.videoTracks[t].clips.map((clip, i) => ({
                    layer: layerId(t, i),
                    kind: kindOfLayer(clip.object),
                    name: clip.object.properties.name.get(),
                    start: clip.start,
                    length: clip.length,
                }));
                tracks.push({ track: t, clips: clips });
            }
            return {
                resolution: [res[0], res[1]],
                frame_rate: seq.properties.rate.get(),
                sequence_length: seq.length,
                current_frame: editor.playback.currentFrame,
                video_tracks: tracks,
                audio_track_count: seq.audioTracks.length,
            };
        },

        describe_layer(args) {
            let clip = resolveClip(args.layer);
            let layer = clip.object;
            let props = [];
            for (let key of Object.keys(layer.properties)) {
                describeProperty(layer.properties[key], key, props, "");
            }
            return {
                layer: args.layer,
                kind: kindOfLayer(layer),
                start: clip.start,
                length: clip.length,
                note: "Keyframe frames on these properties are relative to the clip start (" + clip.start + ").",
                properties: props,
                effects: layer.effects ? layer.effects.map((e) => e.properties.name.get()) : [],
            };
        },

        add_layer(args) {
            let kind = LAYER_KINDS[args.kind];
            if (!kind) {
                throw new Error("Unknown layer kind '" + args.kind + "'. Choose one of: " + Object.keys(LAYER_KINDS).join(", ") + ".");
            }
            let seq = editor.sequence;
            let trackIdx = args.track === undefined ? 0 : +args.track;

            while (seq.videoTracks.length <= trackIdx) {
                trackOps.createTrack({ type: 0, newTrackIdx: seq.videoTracks.length, data: null });
            }

            let track = seq.videoTracks[trackIdx];
            let start = args.start === undefined ? 0 : +args.start;
            let length = args.length === undefined ? seq.length || 180 : +args.length;

            // Clips on a track are kept sorted by start frame.
            let idx = track.clips.length;
            for (let i = 0; i < track.clips.length; i++) {
                if (track.clips[i].start > start) {
                    idx = i;
                    break;
                }
            }

            let object = JSON.parse(JSON.stringify(kind.object));
            let data = {
                type: 0,
                start: start,
                length: length,
                offset: 0,
                relativeRate: 1,
                media: null,
                link: null,
                properties: { name: args.name || kind.name },
                object: object,
            };

            trackOps.createClip({ type: 0, newTrackIdx: trackIdx, newIdx: idx, start: start, length: length, data: data });

            let id = layerId(trackIdx, idx);
            if (args.text !== undefined && kind.type === 7) {
                impl.set_property({ layer: id, path: "text", value: args.text });
            }
            return { layer: id, kind: args.kind, start: start, length: length };
        },

        delete_layer(args) {
            let m = /^v(\d+):(\d+)$/.exec(String(args.layer || ""));
            resolveClip(args.layer);
            trackOps.deleteClip({ type: 0, oldTrackIdx: +m[1], oldIdx: +m[2] });
            return { deleted: args.layer };
        },

        set_property(args) {
            let layer = resolveLayer(args.layer);
            let prop = resolveProperty(layer, args.path);
            let frame = args.frame === undefined ? 0 : +args.frame;
            let value = coerceValue(prop, args.value);
            propertyOps.setValue({ property: prop.getAddress(), frame: frame, value: value });
            return { layer: args.layer, path: args.path, value: value };
        },

        animate_property(args) {
            let layer = resolveLayer(args.layer);
            let prop = resolveProperty(layer, args.path);
            let kfs = args.keyframes || [];
            if (!kfs.length) throw new Error("animate_property needs at least one keyframe.");
            if (!(prop instanceof PZ.property.dynamic)) {
                throw new Error("'" + args.path + "' is a static property and cannot be animated.");
            }

            // Turn animation on through the UI path so the property's static
            // behaviour (constant vs linear) is normalised the same way the
            // animate toggle would do it.
            propertyOps.toggleAnimation(prop, kfs[0].frame || 0, false, true);

            let isGroup = prop instanceof PZ.property.dynamic.group;
            let targets = keyframeTargets(prop);

            for (let i = 0; i < targets.length; i++) {
                let target = targets[i];
                let addr = target.getAddress();
                let wanted = new Set();

                for (let kf of kfs) {
                    let frame = +kf.frame;
                    wanted.add(frame);
                    let value = componentValue(coerceValue(prop, kf.value), prop, i, isGroup);
                    let tween = kf.tween === undefined ? target.defaultTween : +kf.tween;
                    if (target.getKeyframe(frame)) {
                        propertyOps.deleteKeyframe({ property: addr, frame: frame });
                    }
                    propertyOps.createKeyframe({ property: addr, data: new PZ.keyframe(value, frame, tween) });
                }

                // Drop leftovers from whatever the property held before, so the
                // resulting animation is exactly what was asked for.
                for (let existing of Array.prototype.slice.call(target.keyframes)) {
                    if (!wanted.has(existing.frame)) {
                        propertyOps.deleteKeyframe({ property: addr, frame: existing.frame });
                    }
                }
            }
            return { layer: args.layer, path: args.path, keyframes: kfs.length };
        },

        set_expression(args) {
            let layer = resolveLayer(args.layer);
            let prop = resolveProperty(layer, args.path);
            if (!(prop instanceof PZ.property.dynamic)) {
                throw new Error("'" + args.path + "' is a static property and cannot take an expression.");
            }
            if (args.expression) {
                // Constructing it here surfaces a syntax error as a tool error
                // rather than a silently dead expression on the property.
                let test = new PZ.expression(args.expression);
                if (test.error) throw new Error("Expression rejected: " + test.error);
            }
            propertyOps.setExpression({ property: prop.getAddress(), expression: args.expression || null });
            return { layer: args.layer, path: args.path, expression: args.expression || null };
        },

        set_sequence_property(args) {
            let prop = editor.sequence.properties[args.name];
            if (!prop) throw new Error("No sequence property '" + args.name + "'.");
            let value = coerceValue(prop, args.value);
            propertyOps.setValue({ property: prop.getAddress(), frame: 0, value: value });
            return { name: args.name, value: value };
        },

        async render_frame(args) {
            if (!viewport || !viewport.canvas) throw new Error("The viewport is not available to render from.");
            let frame = args.frame === undefined ? editor.playback.currentFrame : args.frame;
            editor.playback.currentFrame = frame;

            // Let the normal viewport loop settle on the new frame first.
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            // The viewport renderer has no preserveDrawingBuffer, so the read
            // has to happen in the same task as the draw.
            viewport._render();
            let src = viewport.canvas;
            let scale = Math.min(1, 768 / Math.max(src.width, src.height));
            let out = document.createElement("canvas");
            out.width = Math.max(1, Math.round(src.width * scale));
            out.height = Math.max(1, Math.round(src.height * scale));
            out.getContext("2d").drawImage(src, 0, 0, out.width, out.height);

            return {
                _image: out.toDataURL("image/png").split(",")[1],
                frame: frame,
            };
        },
    };

    // ------------------------------------------------------------- schemas

    const LAYER_ARG = { type: "string", description: "Layer id from get_project, e.g. \"v0:1\"." };

    PZ.agent.tools = {
        definitions: [
            {
                name: "get_project",
                description:
                    "List the whole project: resolution, frame rate, sequence length, and every video track with its clips. Each clip is one layer and carries the id you pass to the other tools. Call this first in a turn, and again after adding or deleting layers, because ids are track/index pairs and shift when clips are added or removed.",
                input_schema: { type: "object", properties: {}, required: [] },
            },
            {
                name: "describe_layer",
                description:
                    "Read one layer in full: every property with its path, type, current value, whether it is animated, and its keyframes. Call this before setting a property you have not touched before, so you use a path and value shape that exist.",
                input_schema: {
                    type: "object",
                    properties: { layer: LAYER_ARG },
                    required: ["layer"],
                },
            },
            {
                name: "add_layer",
                description:
                    "Add a new layer as a clip on a video track. Higher track numbers composite on top of lower ones. Returns the new layer's id. Note that adding a clip can shift the ids of later clips on the same track.",
                input_schema: {
                    type: "object",
                    properties: {
                        kind: {
                            type: "string",
                            enum: Object.keys(LAYER_KINDS),
                            description:
                                "scene = 3D scene, text = 2D text, shape = ellipse/rectangle, path = custom vector shape, image = still image, adjustment = effects applied to layers below, composite = group.",
                        },
                        track: { type: "integer", description: "Video track index. Defaults to 0. Created if it does not exist yet." },
                        start: { type: "integer", description: "First frame of the clip on the sequence timeline. Defaults to 0." },
                        length: { type: "integer", description: "Clip length in frames. Defaults to the sequence length." },
                        name: { type: "string", description: "Display name for the layer." },
                        text: { type: "string", description: "For kind=text only: the string to display." },
                    },
                    required: ["kind"],
                },
            },
            {
                name: "delete_layer",
                description: "Delete a layer and its clip. Ids of later clips on the same track shift down by one.",
                input_schema: {
                    type: "object",
                    properties: { layer: LAYER_ARG },
                    required: ["layer"],
                },
            },
            {
                name: "set_property",
                description:
                    "Set a single property value on a layer. Use for static values and for one-off values on animated properties at a given frame.",
                input_schema: {
                    type: "object",
                    properties: {
                        layer: LAYER_ARG,
                        path: {
                            type: "string",
                            description:
                                "Property path from describe_layer, e.g. \"opacity\", \"position\", \"text\". Dotted for nested paths.",
                        },
                        value: {
                            description:
                                "The new value. Numbers for scalars, arrays for vectors and colours ([r,g,b] in 0-1), strings for text.",
                        },
                        frame: {
                            type: "integer",
                            description: "Clip-relative frame to set the value at. Defaults to 0. Only meaningful on animated properties.",
                        },
                    },
                    required: ["layer", "path", "value"],
                },
            },
            {
                name: "animate_property",
                description:
                    "Replace a property's animation with the given keyframes, turning animation on if it is off. Frames are relative to the clip start, not the sequence. Any keyframes the property already had at other frames are removed, so pass the complete animation.",
                input_schema: {
                    type: "object",
                    properties: {
                        layer: LAYER_ARG,
                        path: { type: "string", description: "Property path from describe_layer." },
                        keyframes: {
                            type: "array",
                            description: "The complete set of keyframes, in frame order.",
                            items: {
                                type: "object",
                                properties: {
                                    frame: { type: "integer", description: "Clip-relative frame." },
                                    value: { description: "Value at this frame; array for vector and colour properties." },
                                    tween: {
                                        type: "integer",
                                        description:
                                            "Interpolation out of this keyframe: 0 holds the value until the next one, 1 is smooth (the default). Higher values select other easing curves.",
                                    },
                                },
                                required: ["frame", "value"],
                            },
                        },
                    },
                    required: ["layer", "path", "keyframes"],
                },
            },
            {
                name: "set_expression",
                description:
                    "Drive a property from an expression evaluated every frame, instead of keyframes. Good for continuous motion (bobbing, spinning, pulsing) that would otherwise need many keyframes. The last statement is the returned value. Available: the variables frame and time, Math functions unqualified (sin, cos, pow, PI...), and the helpers add, sub, mul, div for vectors. Nothing else resolves — an unknown name is a syntax error. Pass expression: null to clear.",
                input_schema: {
                    type: "object",
                    properties: {
                        layer: LAYER_ARG,
                        path: { type: "string", description: "Property path from describe_layer." },
                        expression: {
                            type: ["string", "null"],
                            description: "e.g. \"sin(time * 2) * 50\" for a scalar, or \"[0, sin(time) * 100]\" for a vector2.",
                        },
                    },
                    required: ["layer", "path", "expression"],
                },
            },
            {
                name: "set_sequence_property",
                description: "Set a sequence-wide property: resolution ([w,h]), rate (frames per second), or motion blur settings.",
                input_schema: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Property name, e.g. \"resolution\" or \"rate\"." },
                        value: { description: "The new value." },
                    },
                    required: ["name", "value"],
                },
            },
            {
                name: "render_frame",
                description:
                    "Render one frame of the project and look at it. Use this to check your work: after building or changing something visual, render a representative frame and judge whether it actually looks right, then fix what does not. Also moves the editor playhead to that frame so the user sees the same thing.",
                input_schema: {
                    type: "object",
                    properties: {
                        frame: { type: "integer", description: "Sequence frame to render. Defaults to the current playhead position." },
                    },
                    required: [],
                },
            },
        ],

        // Undo commands accumulated across the current agent turn.
        _buffer: null,

        async call(name, args) {
            if (!editor) throw new Error("The editor is not ready yet.");
            let fn = impl[name];
            if (!fn) throw new Error("Unknown tool '" + name + "'.");

            // history.operation is a single slot rather than a stack, so an
            // operation left open across the agent's network waits would be
            // clobbered by any edit the user makes in the meantime — and the
            // next pushCommand would then throw on null. Hold it open only for
            // the duration of one tool call and bank the commands ourselves.
            let history = editor.history;
            history.startOperation();
            try {
                return await fn(args || {});
            } finally {
                let commands = history.operation || [];
                history.operation = null;
                if (this._buffer) this._buffer.push.apply(this._buffer, commands);
                else if (commands.length) {
                    // No turn in progress; commit as its own undo step.
                    history.operation = commands;
                    history.finishOperation();
                }
            }
        },

        // One undo group per agent turn: whatever the agent did during the turn
        // comes back out on a single ctrl+Z.
        beginTurn() {
            this._buffer = [];
        },

        endTurn() {
            let commands = this._buffer;
            this._buffer = null;
            if (!commands || !commands.length) return;
            let history = editor.history;
            // Don't merge into an operation the user has open mid-drag.
            if (history.operation !== null) history.finishOperation();
            history.operation = commands;
            history.finishOperation();
        },
    };
})();

// ============================================================================
// agent/client.js
// ============================================================================

// PZ.agent.client — the agent loop, plus one adapter per model provider.
//
// openzoid is a no-build static site with no package manager, so this talks to
// each provider's REST API over fetch rather than through an SDK. Keys live in
// localStorage and requests go straight from the page. Point the endpoint at
// your own proxy if you would rather a key not live in the browser.
//
// Adding a provider means implementing the small interface at the bottom of
// this file: own your native conversation history, and translate the shared
// tool definitions to and from your wire format. The loop itself is shared.

var PZ = PZ || {};
PZ.agent = PZ.agent || {};

(function () {
    "use strict";

    const SYSTEM_PROMPT = [
        "You are an agent embedded in Panzoid Clipmaker 3 (openzoid), a browser-based motion graphics and video editor. You build and edit the user's project directly through the tools you have been given.",
        "",
        "How a project is put together:",
        "- A sequence has a resolution, a frame rate, and a length in frames.",
        "- It holds video tracks. Each track holds clips laid out along the timeline, and each clip contains exactly one layer. Higher-numbered tracks composite on top of lower-numbered ones.",
        "- A layer is a scene (3D), text, a shape, an image, an adjustment, or a composite. Layers carry properties, and most properties can be static, keyframed, or driven by an expression.",
        "",
        "Conventions that are easy to get wrong:",
        "- Layer position is in pixels with the origin at the centre of the frame, x to the right and y upward. At 1920x1080 the top-left corner is [-960, 540].",
        "- Rotation is in radians. Opacity runs 0 to 1. Colours are [r, g, b] arrays in 0 to 1, not 0 to 255.",
        "- Keyframe frames on a layer's properties are relative to that clip's start, not to the sequence timeline. A clip starting at frame 60 animates from its own frame 0.",
        "",
        "How to work:",
        "- Start by calling get_project so you know what is actually there, and call describe_layer before setting a property on a layer you have not inspected this turn.",
        "- Prefer set_expression over long keyframe lists for continuous motion, and animate_property for deliberate, timed movement.",
        "- Render a frame and look at it after you build something visual. Judge what you see rather than assuming the numbers were right, and fix what does not look good. This matters most for anything involving position, scale, or colour.",
        "- Everything you do in one turn is a single undo step for the user, so you are free to iterate.",
        "",
        "Deliver what the user asked for, at the scope they intended. Make routine judgement calls yourself and check in only when different readings would lead to materially different work. When you are done, say briefly what you made and what the user might want to adjust — no recap of every tool call, since they can see the result on the canvas.",
    ].join("\n");

    function store(key, value) {
        try {
            if (value === undefined) return localStorage.getItem(key) || "";
            if (value) localStorage.setItem(key, value);
            else localStorage.removeItem(key);
        } catch (e) {
            return "";
        }
        return value;
    }

    async function postJSON(url, headers, body, label) {
        let response;
        try {
            response = await fetch(url, {
                method: "POST",
                headers: Object.assign({ "content-type": "application/json" }, headers),
                body: JSON.stringify(body),
            });
        } catch (e) {
            throw new Error(
                "Could not reach " + label + ". Check that you are online and that the endpoint in settings is correct. (" + e.message + ")"
            );
        }
        if (!response.ok) {
            let detail = "";
            try {
                let json = await response.json();
                detail = (json.error && (json.error.message || json.error.status)) || JSON.stringify(json);
            } catch (e) {
                detail = await response.text();
            }
            throw new Error("API error " + response.status + ": " + detail);
        }
        return await response.json();
    }

    // ------------------------------------------------------------- Anthropic

    const anthropic = {
        id: "anthropic",
        label: "Anthropic",
        defaultModel: "claude-opus-5",
        defaultBaseUrl: "https://api.anthropic.com",
        keyPlaceholder: "sk-ant-…",
        keyHint: "Create one at console.anthropic.com.",
        matchesKey: (key) => /^sk-ant-/.test(key),

        history: [],
        reset() {
            this.history = [];
        },
        pushUser(text) {
            this.history.push({ role: "user", content: text });
        },

        async send(ctx) {
            let data = await postJSON(
                ctx.baseUrl + "/v1/messages",
                {
                    "x-api-key": ctx.apiKey,
                    "anthropic-version": "2023-06-01",
                    "anthropic-dangerous-direct-browser-access": "true",
                },
                {
                    model: ctx.model,
                    max_tokens: 16000,
                    system: SYSTEM_PROMPT,
                    tools: ctx.tools.map((t) => ({
                        name: t.name,
                        description: t.description,
                        input_schema: t.input_schema,
                    })),
                    messages: this.history,
                },
                ctx.baseUrl
            );

            if (data.stop_reason === "refusal") throw new Error("The model declined this request.");

            // Echoed back verbatim: thinking blocks must return unmodified.
            this.history.push({ role: "assistant", content: data.content });

            let texts = [];
            let calls = [];
            for (let block of data.content || []) {
                if (block.type === "text" && block.text) texts.push(block.text);
                else if (block.type === "tool_use") calls.push({ id: block.id, name: block.name, args: block.input });
            }
            return { texts: texts, calls: calls };
        },

        pushToolResults(results) {
            let content = results.map((r) => {
                if (r.isError) {
                    return { type: "tool_result", tool_use_id: r.id, content: String(r.error), is_error: true };
                }
                if (r.value && r.value._image) {
                    return {
                        type: "tool_result",
                        tool_use_id: r.id,
                        content: [
                            { type: "image", source: { type: "base64", media_type: "image/png", data: r.value._image } },
                            { type: "text", text: "Rendered frame " + r.value.frame + "." },
                        ],
                    };
                }
                return { type: "tool_result", tool_use_id: r.id, content: JSON.stringify(r.value) };
            });
            this.history.push({ role: "user", content: content });
        },
    };

    // ---------------------------------------------------------------- Google

    // Gemini's function declarations use an OpenAPI subset that is stricter
    // than JSON Schema: every property needs a concrete type, union types are
    // not allowed, and unknown keywords are rejected. The shared tool
    // definitions use untyped "value" parameters (they legitimately accept a
    // number, an array or a string), so those become strings here and the tool
    // layer coerces them back using the target property's declared type.
    function toGeminiSchema(schema) {
        if (!schema || typeof schema !== "object") return undefined;

        let type = schema.type;
        let nullable = false;
        if (Array.isArray(type)) {
            nullable = type.indexOf("null") !== -1;
            type = type.filter((t) => t !== "null")[0];
        }

        let out = {};
        let description = schema.description || "";

        if (!type) {
            // Untyped: accept it as text and let the tool layer parse it.
            type = "string";
            description = (description ? description + " " : "") + "Give a number as digits, a list as a JSON array such as [0, 100], and text as-is.";
        }
        out.type = type;
        if (description) out.description = description;
        if (nullable) out.nullable = true;
        if (schema.enum) out.enum = schema.enum.map(String);

        if (type === "object" && schema.properties) {
            out.properties = {};
            for (let key of Object.keys(schema.properties)) {
                out.properties[key] = toGeminiSchema(schema.properties[key]);
            }
            if (schema.required && schema.required.length) out.required = schema.required.slice();
        }
        if (type === "array") {
            out.items = toGeminiSchema(schema.items) || { type: "string" };
        }
        return out;
    }

    const google = {
        id: "google",
        label: "Google (Gemini)",
        defaultModel: "gemini-2.5-pro",
        defaultBaseUrl: "https://generativelanguage.googleapis.com",
        keyPlaceholder: "AIza…",
        keyHint: "Create one at aistudio.google.com/apikey.",
        matchesKey: (key) => /^AIza/.test(key),

        history: [],
        reset() {
            this.history = [];
        },
        pushUser(text) {
            this.history.push({ role: "user", parts: [{ text: text }] });
        },

        async send(ctx) {
            let declarations = ctx.tools.map((t) => {
                let decl = { name: t.name, description: t.description };
                let params = toGeminiSchema(t.input_schema);
                // Gemini rejects an object schema with no properties.
                if (params && params.properties && Object.keys(params.properties).length) {
                    decl.parameters = params;
                }
                return decl;
            });

            let data = await postJSON(
                ctx.baseUrl + "/v1beta/models/" + encodeURIComponent(ctx.model) + ":generateContent",
                { "x-goog-api-key": ctx.apiKey },
                {
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: this.history,
                    tools: [{ functionDeclarations: declarations }],
                    generationConfig: { maxOutputTokens: 16384 },
                },
                ctx.baseUrl
            );

            if (data.promptFeedback && data.promptFeedback.blockReason) {
                throw new Error("The request was blocked: " + data.promptFeedback.blockReason + ".");
            }
            let candidate = (data.candidates || [])[0];
            if (!candidate) throw new Error("The model returned no response.");
            if (candidate.finishReason && ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].indexOf(candidate.finishReason) !== -1) {
                throw new Error("The model stopped: " + candidate.finishReason + ".");
            }

            let parts = (candidate.content && candidate.content.parts) || [];
            // Echoed back verbatim so thought signatures survive the round trip.
            this.history.push({ role: "model", parts: parts });

            let texts = [];
            let calls = [];
            for (let i = 0; i < parts.length; i++) {
                let part = parts[i];
                if (part.functionCall) {
                    calls.push({
                        // Gemini identifies calls by name, not id; keep the index
                        // so repeated calls to one tool stay distinguishable.
                        id: part.functionCall.name + ":" + i,
                        name: part.functionCall.name,
                        args: part.functionCall.args || {},
                    });
                } else if (part.text && !part.thought) {
                    texts.push(part.text);
                }
            }
            if (candidate.finishReason === "MAX_TOKENS" && !calls.length) {
                texts.push("(response cut off at the token limit)");
            }
            return { texts: texts, calls: calls };
        },

        pushToolResults(results) {
            let parts = [];
            for (let r of results) {
                let payload;
                if (r.isError) payload = { error: String(r.error) };
                else if (r.value && r.value._image) payload = { result: "Rendered frame " + r.value.frame + "; the image follows." };
                else payload = { result: r.value === undefined ? null : r.value };

                // functionResponse.response must be a JSON object, never a bare
                // value, so scalars are wrapped above.
                parts.push({ functionResponse: { name: r.name, response: payload } });

                // Images cannot ride inside a functionResponse, so they follow
                // as an ordinary inline part in the same user turn.
                if (!r.isError && r.value && r.value._image) {
                    parts.push({ inlineData: { mimeType: "image/png", data: r.value._image } });
                }
            }
            this.history.push({ role: "user", parts: parts });
        },
    };

    PZ.agent.providers = { anthropic: anthropic, google: google };

    // ------------------------------------------------------------ the client

    PZ.agent.client = {
        running: false,
        aborted: false,

        get providerId() {
            return store("pz.agent.provider") || "anthropic";
        },
        set providerId(v) {
            if (v !== this.providerId) {
                store("pz.agent.provider", v === "anthropic" ? "" : v);
                this.reset();
            }
        },
        get provider() {
            return PZ.agent.providers[this.providerId] || anthropic;
        },

        // Keys, models and endpoints are kept per provider so switching back
        // and forth does not lose the other one's settings.
        get apiKey() {
            return store("pz.agent.apiKey." + this.providerId);
        },
        set apiKey(v) {
            store("pz.agent.apiKey." + this.providerId, v);
        },
        get model() {
            return store("pz.agent.model." + this.providerId) || this.provider.defaultModel;
        },
        set model(v) {
            store("pz.agent.model." + this.providerId, v === this.provider.defaultModel ? "" : v);
        },
        get baseUrl() {
            return store("pz.agent.baseUrl." + this.providerId) || this.provider.defaultBaseUrl;
        },
        set baseUrl(v) {
            store("pz.agent.baseUrl." + this.providerId, v === this.provider.defaultBaseUrl ? "" : v);
        },

        // Which provider does this key look like it belongs to?
        detectProvider(key) {
            for (let id of Object.keys(PZ.agent.providers)) {
                if (PZ.agent.providers[id].matchesKey(key)) return id;
            }
            return null;
        },

        reset() {
            for (let id of Object.keys(PZ.agent.providers)) PZ.agent.providers[id].reset();
        },

        stop() {
            this.aborted = true;
        },

        // events: { onText, onToolUse, onToolResult, onError, onDone }
        async send(userText, events) {
            events = events || {};
            let provider = this.provider;
            if (!this.apiKey) throw new Error("No API key set for " + provider.label + ". Open the agent settings and paste one in.");
            if (this.running) throw new Error("The agent is already working.");

            this.running = true;
            this.aborted = false;
            provider.pushUser(userText);

            PZ.agent.tools.beginTurn();
            try {
                while (true) {
                    if (this.aborted) {
                        if (events.onText) events.onText("(stopped)");
                        break;
                    }

                    let turn = await provider.send({
                        apiKey: this.apiKey,
                        baseUrl: this.baseUrl,
                        model: this.model,
                        tools: PZ.agent.tools.definitions,
                    });

                    for (let text of turn.texts) if (events.onText) events.onText(text);
                    if (!turn.calls.length) break;

                    let results = [];
                    for (let call of turn.calls) {
                        if (events.onToolUse) events.onToolUse(call.name, call.args);
                        try {
                            let value = await PZ.agent.tools.call(call.name, call.args);
                            results.push({ id: call.id, name: call.name, value: value });
                            if (events.onToolResult) events.onToolResult(call.name, value, null);
                        } catch (err) {
                            results.push({ id: call.id, name: call.name, isError: true, error: err && err.message ? err.message : err });
                            if (events.onToolResult) events.onToolResult(call.name, null, err);
                        }
                    }

                    // All results for one assistant turn go back together, or the
                    // model learns to stop issuing parallel calls.
                    provider.pushToolResults(results);
                }
            } catch (err) {
                if (events.onError) events.onError(err);
                else throw err;
            } finally {
                PZ.agent.tools.endTurn();
                this.running = false;
                if (events.onDone) events.onDone();
            }
        },
    };
})();

// ============================================================================
// agent/panel.js
// ============================================================================

// PZ.agent.panel — the chat panel, sitting in the menu bar next to Export.

var PZ = PZ || {};
PZ.agent = PZ.agent || {};

(function () {
    "use strict";

    const COLORS = {
        text: "#ccc",
        dim: "#888",
        panel: "#2a2a2a",
        field: "#1d1d1d",
        border: "#444",
        accent: "#8a2828",
        error: "#c86464",
    };

    function el(tag, style, text) {
        let node = document.createElement(tag);
        if (style) node.style.cssText = style;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    PZ.ui.agent = class extends PZ.ui.panel.nav {
        constructor(editor) {
            super(editor);
            this.title = "AI";
            this.icon = "inspired";
            this.minWidth = 220;
            this.log = null;
            this.create();
        }

        create() {
            this.navigate(PZ.agent.client.apiKey ? this.createChatPage() : this.createSettingsPage(true));
        }

        // ------------------------------------------------------------ chat

        createChatPage() {
            let page = this.createPage("AI agent");
            page.style.cssText = "display:flex;flex-direction:column;height:100%;overflow:hidden;";

            let bar = el("div", "display:flex;gap:6px;padding:0 8px 6px 8px;flex:0 0 auto;");
            bar.appendChild(this.smallButton("New chat", () => {
                PZ.agent.client.reset();
                this.log.textContent = "";
                this.note("Started a new conversation. The project itself is untouched.");
            }));
            bar.appendChild(this.smallButton("Settings", () => this.navigate(this.createSettingsPage(false), true)));
            page.appendChild(bar);

            this.log = el(
                "div",
                "flex:1 1 auto;overflow-y:auto;padding:8px;font-size:12px;line-height:1.5;color:" +
                    COLORS.text +
                    ";background-color:" +
                    COLORS.field +
                    ";margin:0 8px;border-radius:3px;"
            );
            page.appendChild(this.log);

            let inputRow = el("div", "display:flex;flex-direction:column;gap:6px;padding:8px;flex:0 0 auto;");
            let input = el(
                "textarea",
                "resize:none;height:64px;background-color:" +
                    COLORS.field +
                    ";color:" +
                    COLORS.text +
                    ";border:1px solid " +
                    COLORS.border +
                    ";border-radius:3px;padding:6px;font-family:inherit;font-size:12px;"
            );
            input.placeholder = "Describe what you want to make or change…";
            this.input = input;

            let send = this.smallButton("Send", () => this.submit());
            send.style.width = "100%";
            this.sendButton = send;

            input.addEventListener("keydown", (e) => {
                // Enter sends, shift+Enter is a newline. Stop the editor's global
                // shortcut handler from also seeing these keys.
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.submit();
                }
            });

            inputRow.appendChild(input);
            inputRow.appendChild(send);
            page.appendChild(inputRow);

            if (!this.greeted) {
                this.greeted = true;
                setTimeout(() => this.note("Ask for something and I'll build it in the project. Everything I do in one reply is a single undo step."), 0);
            }
            return page;
        }

        smallButton(label, onClick) {
            let button = el(
                "button",
                "background-color:" +
                    COLORS.panel +
                    ";color:" +
                    COLORS.text +
                    ";border:1px solid " +
                    COLORS.border +
                    ";border-radius:3px;padding:5px 10px;cursor:pointer;font-size:12px;",
                label
            );
            button.onclick = onClick;
            return button;
        }

        append(text, color, italic) {
            if (!this.log) return;
            let atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
            let line = el(
                "div",
                "margin-bottom:8px;white-space:pre-wrap;word-break:break-word;color:" +
                    (color || COLORS.text) +
                    ";" +
                    (italic ? "font-style:italic;" : ""),
                text
            );
            this.log.appendChild(line);
            if (atBottom) this.log.scrollTop = this.log.scrollHeight;
            return line;
        }

        note(text) {
            this.append(text, COLORS.dim, true);
        }

        submit() {
            let text = this.input.value.trim();
            if (!text) return;
            if (PZ.agent.client.running) return;

            this.input.value = "";
            this.append("› " + text, "#e0e0e0");

            this.sendButton.textContent = "Working…";
            this.sendButton.onclick = () => PZ.agent.client.stop();

            let thinking = this.append("thinking…", COLORS.dim, true);

            PZ.agent.client.send(text, {
                onText: (t) => {
                    if (thinking) {
                        thinking.remove();
                        thinking = null;
                    }
                    this.append(t);
                },
                onToolUse: (name) => {
                    if (thinking) {
                        thinking.remove();
                        thinking = null;
                    }
                    this.note("· " + name.replace(/_/g, " "));
                },
                onToolResult: (name, value, err) => {
                    if (err) this.append("· " + name + " failed: " + err.message, COLORS.error, true);
                },
                onError: (err) => {
                    if (thinking) {
                        thinking.remove();
                        thinking = null;
                    }
                    this.append(String(err.message || err), COLORS.error);
                },
                onDone: () => {
                    if (thinking) thinking.remove();
                    this.sendButton.textContent = "Send";
                    this.sendButton.onclick = () => this.submit();
                },
            });
        }

        // -------------------------------------------------------- settings

        createSettingsPage(isFirstRun) {
            let client = PZ.agent.client;
            let page = this.createPage("AI agent settings", !isFirstRun, () => true);
            page.style.cssText = "padding:0 8px 8px 8px;overflow-y:auto;height:100%;";

            let intro = el(
                "div",
                "font-size:12px;color:" + COLORS.dim + ";line-height:1.5;margin-bottom:12px;",
                isFirstRun
                    ? "Paste an API key to enable the agent. openzoid runs as static files with no server, so the key is stored in this browser's localStorage and sent directly to the provider from this page. Use a key you are willing to keep here, or point the endpoint below at your own proxy instead."
                    : "Keys are stored in this browser's localStorage and sent directly to the provider from this page. Each provider keeps its own key, model and endpoint."
            );
            page.appendChild(intro);

            // Declared up front: the provider select rewrites them on change.
            let key, model, url, hint, status;

            let select = this.select(
                page,
                "Provider",
                Object.keys(PZ.agent.providers).map((id) => ({ value: id, label: PZ.agent.providers[id].label })),
                client.providerId,
                (value) => {
                    client.providerId = value;
                    let provider = client.provider;
                    key.value = client.apiKey;
                    key.placeholder = provider.keyPlaceholder;
                    model.value = client.model;
                    model.placeholder = provider.defaultModel;
                    url.value = client.baseUrl;
                    url.placeholder = provider.defaultBaseUrl;
                    hint.textContent = provider.keyHint;
                }
            );

            key = this.field(page, "API key", client.apiKey, client.provider.keyPlaceholder, "password");
            hint = el("div", "font-size:11px;color:" + COLORS.dim + ";margin:-6px 0 10px 0;", client.provider.keyHint);
            page.appendChild(hint);

            // Pasting a key that clearly belongs to the other provider is much
            // more likely a provider mix-up than a deliberate choice.
            key.addEventListener("input", () => {
                let detected = client.detectProvider(key.value.trim());
                if (detected && detected !== client.providerId) {
                    select.value = detected;
                    let pending = key.value.trim();
                    select.onchange();
                    key.value = pending;
                }
            });

            model = this.field(page, "Model", client.model, client.provider.defaultModel);
            url = this.field(page, "Endpoint", client.baseUrl, client.provider.defaultBaseUrl);

            let save = this.smallButton("Save", () => {
                let provider = client.provider;
                client.apiKey = key.value.trim();
                client.model = model.value.trim() || provider.defaultModel;
                client.baseUrl = url.value.trim() || provider.defaultBaseUrl;
                if (!client.apiKey) {
                    status.textContent = "A key is required.";
                    status.style.color = COLORS.error;
                    return;
                }
                this.navigate(this.createChatPage());
            });
            save.style.cssText += "margin-top:6px;width:100%;";
            page.appendChild(save);

            status = el("div", "font-size:12px;margin-top:8px;color:" + COLORS.dim + ";");
            page.appendChild(status);

            if (!isFirstRun) {
                let clear = this.smallButton("Forget key", () => {
                    client.apiKey = "";
                    key.value = "";
                    status.textContent = client.provider.label + " key removed from this browser.";
                    status.style.color = COLORS.dim;
                });
                clear.style.cssText += "margin-top:8px;width:100%;";
                page.appendChild(clear);
            }
            return page;
        }

        select(parent, label, options, value, onChange) {
            parent.appendChild(el("div", "font-size:12px;color:" + COLORS.text + ";margin-bottom:4px;", label));
            let node = el(
                "select",
                "width:100%;box-sizing:border-box;background-color:" +
                    COLORS.field +
                    ";color:" +
                    COLORS.text +
                    ";border:1px solid " +
                    COLORS.border +
                    ";border-radius:3px;padding:6px;margin-bottom:10px;font-size:12px;"
            );
            for (let option of options) {
                let node2 = el("option", "", option.label);
                node2.value = option.value;
                node.appendChild(node2);
            }
            node.value = value;
            node.onchange = () => onChange(node.value);
            node.addEventListener("keydown", (e) => e.stopPropagation());
            parent.appendChild(node);
            return node;
        }

        field(parent, label, value, placeholder, type) {
            parent.appendChild(el("div", "font-size:12px;color:" + COLORS.text + ";margin-bottom:4px;", label));
            let input = el(
                "input",
                "width:100%;box-sizing:border-box;background-color:" +
                    COLORS.field +
                    ";color:" +
                    COLORS.text +
                    ";border:1px solid " +
                    COLORS.border +
                    ";border-radius:3px;padding:6px;margin-bottom:10px;font-size:12px;"
            );
            input.type = type || "text";
            input.value = value || "";
            input.placeholder = placeholder || "";
            input.addEventListener("keydown", (e) => e.stopPropagation());
            parent.appendChild(input);
            return input;
        }
    };
})();
