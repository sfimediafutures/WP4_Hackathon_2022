

class FancySub {
    constructor(sequencer, targetElement, options) {

        /***
         * Supported options:
         * 
         * text_track, default "text" - which track of the sub dataset is the text? 
         * cast, map of id -> {src: url to avatar, name: printable name, color: person's color}
         * hiviz - Use high contrast rendering
         * adjust_cps - adjust the characters pr second (true or false)
         * min_cps - minimum chars pr second
         * max_cps - maximum chars pr second
         * sub_time_factor - 1.0 is default - how long to show (a 5 second sub will be 5.5 at factor 1.1)
         * min_sub_time - 1.2 default, minimum time for a subtitle (if adjusting)
         */

         let default_options = {
            text_track: "text",
            enabled: true,
            adjust_cps: false,
            sub_time_factor: 1.0,
            min_sub_time: 1.2,
            cast: {}
         }

        this.sequencer = sequencer;
        this.targetElement = targetElement;

        if (!this.targetElement) throw new Error("Missing target element", targetElement);
        this.options = options || {};
        for (let d in default_options) {
            if (this.options[d] === undefined)
                this.options[d] = default_options[d]
        }
     
        this.sequencer.on("change", (e) => this.render(e.new));
        this.sequencer.on("remove", (e) => {
            let x = this.targetElement.querySelector(".fancysub#" + e.key);
            if (x) this.targetElement.removeChild(x);
        });
    }

    load(casturl, suburl) {
        let _this = this;
        return new Promise(function(resolve, reject) {
            let load_cast = false;
            let load_url = false;
            fetch(casturl)
                .then(response => response.json())
                .then(data => {
                    _this.options.cast = {};
                    for (var k in data) _this.options.cast[k.toLowerCase()] = data[k];
                    load_cast = true;
                    if (load_url) resolve();
                });

            fetch(suburl)
                .then(response => response.json())
                .then(data => {
                    let idx = 0;
                    data.forEach(sub => {
                        let id = "sub" + idx;
                        idx++;
                        if (sub.who) sub.who = String(sub.who)
                        _this.sequencer.addCue(id, [sub.start, sub.end], sub);
                        load_url = true;
                        if (load_cast) resolve();
                    });
                });
        });
    }

    isEnabled() {
        return this.enabled;
    }

    enable() {
        this.enabled = true;
        this.targetElement.classList.remove("fs_hidden");
    }

    disable() {
        this.enabled = false;
        this.targetElement.classList.add("fs_hidden");
    }

    // ************ Render advanced subs - chat style *************
    render(data) {
        let _this = this;

        let fsub = data;
        if (!fsub.data[this.options.text_track]) return;
        let text = fsub.data[this.options.text_track];

        // If we are to adjust the speed of the subtitle, check that now
        if (this.options.adjust_cps && !fsub.data.adjusted) {
            // Calculate CPS
            let cps = text.length / parseFloat(fsub.data.end - fsub.data.start);
            let new_end;
            console.log("CPS is", cps, fsub.data.start, fsub.data.end);
            if (cps < parseFloat(this.options.min_cps)) {
                new_end = fsub.data.start + Math.max(this.options.min_sub_time, text.length / parseFloat(this.options.min_cps));
                console.log("Sub is too slow", text);
            } else if (cps > parseFloat(this.options.max_cps)) {
                new_end = fsub.data.start + Math.max(this.options.min_sub_time, text.length / parseFloat(this.options.max_cps));
                console.log("Sub is too quick", text);
            }
            if (new_end && new_end != fsub.data.end) {
                cps = text.length / (fsub.data.end - fsub.data.start);
                new_end = Math.max(fsub.data.start + _this.options.min_sub_time, new_end);
                console.log("Adjusting sub, end moved from", fsub.data.end, "to", new_end, (new_end - fsub.data.start).toFixed(2), "s, cps", cps);
                fsub.original_end = fsub.data.end;
                fsub.data.end = new_end;
                fsub.data.adjusted = true;
                this.sequencer.addCue(fsub.key, [fsub.data.start, new_end], fsub.data);
                return;
            }
        } else if (this.options.sub_time_factor != 1.0 && fsub.data.adjusted != _this.options.sub_time_factor) {
            let e = fsub.data.original_end || fsub.data.end;
            let new_end = fsub.data.start + ((e - fsub.data.start) * this.options.sub_time_factor);
            new_end = Math.max(fsub.data.start + _this.options.min_sub_time, new_end);
            let cps = text.length / (new_end - fsub.data.start);
            console.log("Adjusting", fsub.key,"sub factor", this.options.sub_time_factor, "end moved from", e, "to", new_end, (new_end - fsub.data.start).toFixed(2), "s, cps", cps);
            fsub.data.original_end = fsub.data.end;
            fsub.data.end = new_end;
            fsub.data.adjusted = _this.options.sub_time_factor;
            this.sequencer.addCue(fsub.key, [fsub.data.start, new_end], fsub.data);
            return;
        }

        let _make_msg = function(who, text, data) {
            who = who.toLowerCase();
            if (!text) throw new Error("Refusing to make fsub with no text");

            // Avoid templates as that means adding html as well
            let e_sub = document.createElement("div");
            e_sub.classList.add("fancysub");
            e_sub.setAttribute("id", data.key);
            e_sub.setAttribute("who", who.replace(" ", "_"));

            let e_icon = document.createElement("img");
            e_icon.classList.add("fancysub-icon");
            e_sub.appendChild(e_icon);

            let e_text = document.createElement("div");
            e_text.classList.add("fancysub-text");
            e_sub.appendChild(e_text);
            if (_this.options.hiviz) e_text.classList.add("fancysub-hiviz");

            if (_this.options.cast[who] === undefined) {
                console.log("Missing", who, "in", _this.options.cast);
                who = "undefined";
                e_sub.style.background = "darkgray";
            }
            if (text) {
                if (_this.options.cast[who]) {
                    if (!_this.options.cast[who].color) throw new Error("Missing color for cast member", who);
                    if (!_this.options.cast[who].src) throw new Error("Missing src for cast member", who);

                    e_sub.style.background = _this.options.cast[who].color || "lightgray";
                    e_icon.src = _this.options.cast[who].src
                } else {
                    e_icon.src = "undefined.png";
                }
            } else {
                e_sub.querySelector(".icon").classList.add("hidden");
            }
            // If we have an index - we know there are multiple on screen
            if (data.idx != undefined) {
                if (data.idx % 2 == 1) e_sub.classList.add("lower")   
                else e_sub.classList.add("higher");
            } else {
              // Detect if there is another one on screen already
              if (_this.targetElement.querySelectorAll(".fancysub").length > 0) {
                // console.log("Going hi and lo (auto)", _this.targetElement, );
                _this.targetElement.querySelector(".fancysub").classList.add("fancysub-higher");
                e_sub.classList.add("fancysub-lower");
              }

            }

            text = text.replace(/^- ?/, "")

            // if (text.startsWith("- ")) text = text.substr(2);
            e_text.innerHTML = text || "";
            // If right aligned, fix that
            if (data.data.align == "right") {
                e_sub.classList.add("right");
            }

            if (_this.options.subclasses) {
                e_sub.classList.add(_this.options.subclasses);
                e_text.classList.add(_this.options.subclasses);
            }

            return e_sub;
        }

        let check_sub = function(who, data) {
            // Check if the given person already has a visible sub
            _this.targetElement.querySelectorAll(".fancysub[who='" + who.toLowerCase().replace(" ", "_") + "']")
                .forEach(s => _this.targetElement.removeChild(s));

            // Check if there are any subs that were auto-extended beyond the start of _this one
            _this.targetElement.querySelectorAll(".fancysub").forEach(s => {
                let cue = _this.sequencer.getCue(s.getAttribute("id"));
                if (cue && cue.data.adjusted && (cue.data.original_end < data.start)) {
                    _this.targetElement.removeChild(s)
                }
            });

        }


        let msg = _make_msg(fsub.data.who, fsub.data[this.options.text_track], data);

        if (0 && msg && msg.classList.contains("lower")) {
            msg.style.opacity = 0.01;
            setTimeout(() => msg.style.opacity = 1.0, 700);
        }

        check_sub(fsub.data.who, data.data);

        if (msg) this.targetElement.appendChild(msg);
    }
}