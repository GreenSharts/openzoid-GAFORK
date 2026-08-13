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
