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
