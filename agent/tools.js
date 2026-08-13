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
