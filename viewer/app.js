var rubberDuck = function(target, options) {

    let API = {};
    API.read_speed = 16;

    if (typeof(target) == "string")
      API.targetElement = document.querySelector(target);
    else
      API.targetElement = target;

    let default_options = {
        track: true,  // Deprecacted?
        markingbox: false,
        pip: false,
        pos: true,
        pippos: true,
        rendersubs: true,
        advancedsubs: true,
        keyboard: true,
        index: true,
        tts: false,
        tts_lang: "nb",
        tts_autopause: true,
        controls: true,
        audiodescription: true,
        audioon: false,
        wakelock: false,
        video: true,
        audio: true,
        hide_controls: true,
        responsive_voice: false,
        screenreadersubs: true,
        hiviz: undefined,
        chat_sub_delay: 1.0,
        show_tracking: false,  // Deprecated?
        voice_index: false,
        adjust_cps: false,
        min_cps: 12,
        max_cps: 18,
        min_sub_time: 1.2,
        sub_time_factor: 1.0,
        text_track: "text",
        auto_animate: false,
        animate_limit: [15, 60],
        animate_ignore: [10, 10],
        fake_hearing_issues: false
    };


    let __autopaused = false;
    let _is_speaking = false;
    let _traditional = false;  // Traditional (fixed) aspect ratio?
    let wakeLock = null;

    let get_hash = function(str) {

        var hash = 0;
        if (str.length == 0) {
            return hash;
        }
        for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = (hash & hash) & 0xffffff; // Convert to 24bit integer
        }
        return hash;
    }

    API.options = options;
    for (let d in default_options) {
        if (API.options[d] === undefined)
            API.options[d] = default_options[d]
    }
    if (API.options.tts_lang == "nb") {
        if (!API.options.responsive_voice) {
            console.log("Norwegian text-to-speech but no responsive voice - might be very bad");
           //API.options.responsive_voice = true;
        }
    }

    API.to = new TIMINGSRC.TimingObject();

    if (API.options.wakelock && "wakeLock" in navigator) {
        const requestWakeLock = async () => {
          try {
            wakeLock = await navigator.wakeLock.request();
            wakeLock.addEventListener('release', () => {
              console.log('Screen Wake Lock released:', wakeLock.released);
            });
            console.log('Screen Wake Lock released:', wakeLock.released);
          } catch (err) {
            console.error(`${err.name}, ${err.message}`);
          }
        };

        API.to.on("change", evt => {
            if (this.vel == 0) {
                // Paused, release the lock
                if (wakeLock) {
                    wakeLock.release();
                }
            } else {
                requestWakeLock();
            }
        });
    }

    if (options.mcorp_appid) {
        API.app = MCorp.app(options.mcorp_appid);
    }

    API.play = function() {

        API.targetElement.querySelector(".controls").classList.remove("hidden");

        API.screenreadersub = API.targetElement.querySelector(".screenreadersub");

        if (API.mediaElement)
            API.mediaElement.play();

        if (API.targetElement.querySelector(".overlay")) {
            API.targetElement.querySelector(".overlay").style.display = "none";
        }

        if (options.mcorp_appid) {
            // API.app = MCorp.app(options.mcorp_appid);
            API.app.ready.then(function() {
                if (API.mediaElement) {
                    console.log("Video loaded, and mcorp app ready - check entry");
                    let hash = API.manifest.id || 0;
                    // let hash = get_hash(API.mediaElement.src);
                    if (API.app.motions.entry.pos != hash) {
                        console.log("Changed content", API.app.motions.entry.pos, hash);
                        API.app.motions.entry.update(hash);
                        API.app.motions.private.update(0,1);
                    }

                    if (API.app.motions.duration.pos != API.mediaElement.duration && app.mediaElement.duration) {
                        try {
                            API.app.motions.duration.update(API.mediaElement.duration);
                        } catch (err) {}
                    }
                }

                console.log("Online sync ready");
                API.to.timingsrc = API.app.motions.private;
                API.resize(null, true);
            });
        } else {
            API.to.update({position: 0, velocity:1});
        }

        // Default audio on?
        if (API.options.audioon) {
          let snd = API.targetElement.querySelector("#btnsound");
          let soundOn = snd.classList.contains("active");
          if (!soundOn) snd.click();
        } else {
            if (API.mediaElement)
                API.mediaElement.muted = true;
        }

    }

    API.sequencer = new TIMINGSRC.Sequencer(API.to);
    API.subsequencer = new TIMINGSRC.Sequencer(API.to);
    API.idxsequencer = new TIMINGSRC.Sequencer(API.to);

    // ***************** Controls ******************'
    let ctrltimeout;
    let showControls = function(visible) {
      if (API.options.hide_controls == false) return;
      if (!API.options.controls) return;
      clearTimeout(ctrltimeout);

        let ctrl = API.targetElement.querySelector(".controls");
        if (visible === undefined) {
            // Auto
            if (ctrl.classList.contains("hidden")) {
                // Show but set timeout if we're playing
                if (API.to.vel != 0) {
                    ctrltimeout = setTimeout(function() {
                        showControls(false);
                    }, 5000);                    
                }
                // Show it
                ctrl.classList.remove("hidden");
            } else {
                ctrl.classList.add("hidden");
            }
        } else {
            if (visible) {
                ctrl.classList.remove("hidden");
            } else {
                ctrl.classList.add("hidden");
            }
        }
    }

    let toggle_sound = function(evt) {
      let snd = API.targetElement.querySelector("#btnsound");
      let soundOn = !snd.classList.contains("active");
            console.log("SoundOn:", soundOn);
            if (!soundOn) {
                if (API.mediaElement) {
                    API.mediaElement.muted = true;
                    if (API.mediaElement.tagName == "AUDIO")
                        API.mediaElement.sync.pause(true);
                }
                snd.classList.remove("active");
                toggle_audiodescription(null, false);
            } else {
                if (API.mediaElement) {
                    if (API.mediaElement.tagName == "AUDIO")
                        API.mediaElement.sync.pause(false);
                    API.mediaElement.muted = false;
                }
                snd.classList.add("active");
                toggle_audiodescription(null, false);
            }
    };


    let toggle_audiodescription = function(evt, force) {
        if (!API.audiodescriptionElement && force !== undefined) return;

        let btn = API.targetElement.querySelector("#btnaudiodescription");
        let isOn = !btn.classList.contains("active");
        console.log("audiodescriptionOn:", isOn, force);
        if (!isOn || force == false) {
            // Check if sound is on
            let snd = API.targetElement.querySelector("#btnsound");
            let soundOn = snd.classList.contains("active");
            if (API.audiodescriptionElement) {
                API.audiodescription_sync.pause()
                API.audiodescriptionElement.muted = true;
                API.audiodescriptionElement.pause();
                if (API.mediaElement)
                    API.mediaElement.muted = !soundOn;
            } else {
                // Enable TTS here if we don't have a separate sound track
                API.tts = true;
            }

            btn.classList.remove("active");
        } else {
            // Syns tolk is on - mute video and get the audiodescription going
            if (API.audiodescriptionElement) {
                if (API.mediaElement)
                    API.mediaElement.muted = true;
                API.audiodescription_sync.pause(false);
                API.audiodescriptionElement.muted = false;                
            } else {
                API.tts = false;
            }
            btn.classList.add("active");
        }
    };


    let btns = {
        "btntrack": function(evt) {
            evt.preventDefault();
            let isActive = !evt.srcElement.classList.contains("active");
            options.markingbox = isActive;
            console.log("Markings is now", isActive);
            if (isActive) {
                API.sequencer.getActiveCues().forEach(cue => {
                    if (cue.data.pos) {
                        API.targetElement.querySelector(".markingbox").classList.remove("hidden");
                        API.targetElement.querySelectorAll(".markingbox_alt").forEach(e => e.classList.remove("hidden"));
                    }
                });
                evt.srcElement.classList.add("active");
            } else {
                API.targetElement.querySelector(".markingbox").classList.add("hidden");
                API.targetElement.querySelectorAll(".markingbox_alt").forEach(e => e.classList.add("hidden"));
                evt.srcElement.classList.remove("active");
            }
        },
        "btnpip": function(evt) {
            evt.preventDefault();
            API.options.pip = !evt.srcElement.classList.contains("active");
            let pip = API.targetElement.querySelector(".pip");
            if (API.options.pip) evt.srcElement.classList.add("active")
            else evt.srcElement.classList.remove("active");
            if (API.options.pip) {
                if (!pip.sync) {
                    pip.sync = MCorp.mediaSync(pip, API.to, {
                        skew: -6
                    });
                }
                pip.classList.remove("hidden");
            } else {
                if (pip) pip.classList.add("hidden");
            }
            API.resize(null, true);
        },
        "btnpippos": function(evt) {
            evt.preventDefault();
            API.options.pippos = !evt.srcElement.classList.contains("active");
            API.options.pipskew = !API.options.pippos;
            if (API.options.pippos) {
                evt.srcElement.classList.add("active");
                API.targetElement.querySelector(".pip").classList.remove("pipfixed");
            } else {
                evt.srcElement.classList.remove("active");
                API.targetElement.querySelector(".pip").classList.add("pipfixed");
                API.targetElement.querySelector(".pip").classList.remove("pipleft"); // in case it's on the left
            }
            API.resize(null, true);
        },
        "btnpos": function(evt) {
            evt.preventDefault();
            API.options.pos = !evt.srcElement.classList.contains("active");
            console.log("Trigger btnpos");
            //API.options.pipskew = API.options.pos;
            if (API.options.pos) {
                evt.srcElement.classList.add("active");
                _traditional = false;
                API.targetElement.style.width = "100%";
                API.targetElement.style.height = "100%";
                API.mediaElement.style.width = "";
                API.mediaElement.style.height = "";
            } else {
                evt.srcElement.classList.remove("active");
                // In case we used pipskew, return the width of the outer container
                API.mediaElement.style.width = "100%";
                API.mediaElement.style.height = "";
                _traditional = true;
            }
            API.resize(null, true);

            // Need to resize twice to get everything good to go!
            setTimeout(API.resize, 10);
        },
        "btnstart": function(evt) {
            evt.preventDefault();
            API.to.update({
                position: 0,
                velocity: 0
            })
        },
        "btnrev": function(evt) {
            evt.preventDefault();
            API.to.update({
                position: Math.max(0, API.to.pos - 15)
            })
        },
        "btnplay": function(evt) {
            evt.preventDefault();
            API.to.update({
                velocity: 1
            })
        },
        "btnpause": function(evt) {
            evt.preventDefault();
            API.to.update({
                velocity: 0
            })
        },
        "btnff": function(evt) {
            evt.preventDefault();
            API.to.update({
                position: API.to.pos + 10
            })
        },
        "btnfs": function(evt) {
            evt.preventDefault();
            API.toggle_fullscreen(API.targetElement);
        },
        "btnsound": function(evt) {
            evt.preventDefault();
            toggle_sound(evt);
        },
        "btnaudiodescription": function(evt) {
            evt.preventDefault();
            toggle_audiodescription(evt);
        },
        "btnhiviz": function(evt) {

            evt.preventDefault();
            API.options.hiviz = !evt.srcElement.classList.contains("active");

            console.log("hiviz triggered", API.options.hiviz);

            if (API.options.hiviz) {
                evt.srcElement.classList.add("active");
                API.options.subclasses="hiviz";
                // Put on any visible subs now
                API.targetElement.querySelectorAll(".advancedsub .text").forEach(e => e.classList.add(API.options.subclasses));
                API.targetElement.querySelectorAll(".advancedsub").forEach(e => e.classList.add(API.options.subclasses));
            } else {
                evt.srcElement.classList.remove("active");
                // Remove from any visible subs now
                API.targetElement.querySelectorAll(".advancedsub .text").forEach(e => e.classList.remove(API.options.subclasses));
                API.targetElement.querySelectorAll(".advancedsub").forEach(e => e.classList.remove(API.options.subclasses));
                API.options.subclasses="";
            }
        },
        "btnrendersubs": function(evt) {
            evt.preventDefault();
            API.options.rendersubs = !evt.srcElement.classList.contains("active");
            if (!API.options.rendersubs) {
                evt.srcElement.classList.remove("active");
                // Clear away any subtitles
                API.targetElement.querySelector(".subtitle span").innerHTML = "";
                API.targetElement.querySelectorAll(".subtitle .advancedsub").forEach(e => {
                    e.parentElement.removeChild(e);
                });
            } else {
                evt.srcElement.classList.add("active");
            }
        },
        "btnadvancedsubs": function(evt) {
            evt.preventDefault();
            API.options.advancedsubs = !evt.srcElement.classList.contains("active");

            if (API.options.advancedsubs) {
                evt.srcElement.classList.add("active");
                // Remove any existing sub, as it will not be removed automatically
                API.targetElement.querySelector(".subtitle span").innerHTML = "";
            } else {
                evt.srcElement.classList.remove("active");         
                API.targetElement.querySelectorAll(".subtitle .advancedsub").forEach(e => {
                    e.parentElement.removeChild(e);
                });
            }
        },
        "btn_nrktegnspraak": function(evt) {
            evt.preventDefault();
            let on = !evt.srcElement.classList.contains("active");
            let pip = API.targetElement.querySelector(".pip");
            let vid = API.mediaElement;
            console.log("NRK tegnspraak:", on);
            if (on) {
                if (!pip.sync) {
                    pip.sync = MCorp.mediaSync(pip, API.to, {
                        skew: -6
                    });
                }
                pip.classList.remove("hidden");
                pip.classList.add("pipfixed");

                // No auto tracking
                API.options.pip = true;
                API.options.pippos = false;
                API.options.pos = false;
                API.targetElement.querySelector("#btnpippos i").classList.remove("active");
                API.targetElement.querySelector("#btnpip i").classList.add("active");
                API.targetElement.querySelector("#btnpos i").classList.remove("active");

                console.log("Removing a bunch of classes");
                vid.classList.remove("auto-resize");
                vid.classList.remove("portrait");
                vid.classList.add("landscape");

                evt.srcElement.classList.add("active");
                // Make video container smaller
                API.mediaElement.style.width = "80%";
                API.mediaElement.style.height = "80%";
                vid.style.left = "0px";
                vid.style.width = "100%";
                vid.style.top = "0px";
            } else {
                vid.classList.add("auto-resize");
                evt.srcElement.classList.remove("active");
                pip.classList.remove("pipfixed");
                pip.style.width = "";
                pip.style.position = "";
                pip.style.right = "";
                pip.style.bottom = "";
                API.mediaElement.style.width = "100%";
                API.mediaElement.style.height = "100%";
                vid.style.left = "";
                vid.style.maxHeight = "";
                vid.style.maxWidth = "";
                vid.style.top = "";
                vid.style.height = "";
                vid.style.width = "";
                API.resize();
            }
        },
        "btn_nrktegnspraak_zoom": function(evt) {
            evt.preventDefault();
            let on = !evt.srcElement.classList.contains("active");
            let pip = API.targetElement.querySelector(".pip");
            let vid = API.mediaElement;
            console.log("NRK tegnspraak:", on);
            if (on) {
                if (!pip.sync) {
                    pip.sync = MCorp.mediaSync(pip, API.to, {
                        skew: -6
                    });
                }
                pip.classList.remove("hidden");
                pip.classList.add("pipfixed");
                // No auto tracking
                API.options.pip = true;
                API.options.pippos = false;
                API.targetElement.querySelector("#btnpippos i").classList.remove("active");
                API.targetElement.querySelector("#btnpip i").classList.add("active");

                evt.srcElement.classList.add("active");
                // Make PIP fixed on the side
                // Make video container smaller
                API.mediaElement.style.width = "80%";
            } else {
                pip.classList.remove("pipfixed");
                evt.srcElement.classList.remove("active");
                API.mediaElement.style.width = "100%";
                API.resize();
            }
        }
    }

    for (let btn in btns) {
        let opt = API.options[btn.substr(3)];
        if (opt !== false) {
          let b = btn;
          if (API.targetElement.querySelector("#" + btn))
              API.targetElement.querySelector("#" + btn).addEventListener("click", evt => {evt.stopPropagation(); btns[b](evt)});
        } else if (opt === undefined) {
            if (API.targetElement.querySelector("#" + btn)) API.targetElement.querySelector("#" + btn).style.display = "none";
        }
    }


    API.to.on("change", function() {
      if (!options.controls) return;
        if (this.vel == 0) {
            clearTimeout(ctrltimeout);
            showControls(true);
            API.targetElement.querySelector("#btnplay i").classList.remove("hidden");
            API.targetElement.querySelector("#btnpause i").classList.add("hidden");
        } else {
            showControls(false);
            API.targetElement.querySelector("#btnpause i").classList.remove("hidden");
            API.targetElement.querySelector("#btnplay i").classList.add("hidden");
        }
    });

    // ***************** Subtitles - either "normal" or "advanced" ***************
    if (API.options.rendersubs || API.options.screenreadersubs) {
        API.subsequencer.on("change", evt => {
            let subs = API.targetElement.querySelector(".subtitle");
            let data = evt.new.data;

            console.log("Change", data);

            if (API.options.fake_hearing_issues) {
                // We dampen the sound randomly during the subtitle
                if (Math.random() > 0.2) {
                    let sub_duration = data.end - data.start;
                    let len = Math.random() * sub_duration;
                    let offset = Math.random() * (sub_duration - len);
                    console.log("Will mute between", offset, "and", offset + len);
                    setTimeout(() => API.mediaElement.volume = 0.1, 1000 * offset); 
                    setTimeout(() => API.mediaElement.volume = 1.0, 1000 * (offset + len)); 
                }
            }


            let text = data;
            if (typeof(text) != "string") {
                text = data[API.options.text_track];
            }

            if (!text) {
                console.log("Missing text for '" + API.options.text_track + "':", data);
                return;
            }

            if (API.screenreadersub && API.options.screenreadersubs) {

                // Clean up a bit - if hyphenated concat
                text = text.replace("<br>", "\n")
                text = text.replace(/-\W/, "")
                text = text.replace(/^-/, "")

                let t = document.createElement("span");
                t.innerHTML = text + " ";
                t.setAttribute("id", "txt_" + evt.key);
                API.screenreadersub.appendChild(t);
                // API.screenreadersub.innerHTML = text;
            }
            if (!API.options.rendersubs) return;

            // If we are to adjust the speed of the subtitle, check that now
            if (API.options.adjust_cps) {
                // Calculate CPS
                let cps = text.length / parseFloat(data.end - data.start);
                let new_end;
                console.log("CPS is", cps, data.start, data.end);
                if (cps < parseFloat(API.options.min_cps)) {
                    new_end = data.start + Math.max(API.options.min_sub_time, text.length / parseFloat(API.options.min_cps));
                    console.log("Sub is too slow", text);
                } else if (cps > parseFloat(API.options.max_cps)) {
                    new_end = data.start + Math.max(API.options.min_sub_time, text.length / parseFloat(API.options.max_cps));
                    console.log("Sub is too quick", text);
                }
                if (new_end && new_end != data.end) {
                    cps = text.length / (data.end - data.start);
                    console.log("Adjusting sub, end moved from", data.end, "to", new_end, (new_end - data.start).toFixed(2), "s, cps", cps);
                    data.original_end = data.end;
                    data.end = new_end;
                    data.adjusted = true;
                    API.subsequencer.addCue(evt.new.key, [data.start, new_end], data);
                    return;
                }
            } else if (API.options.sub_time_factor != 1.0 && !data.adjusted) {
                let new_end = data.start + ((data.end - data.start) * API.options.sub_time_factor);
                let cps = text.length / (new_end - data.start);
                console.log("Adjusting sub factor", API.options.sub_time_factor, "end moved from", data.end, "to", new_end, (new_end - data.start).toFixed(2), "s, cps", cps);
                data.original_end = data.end;
                data.end = new_end;
                data.adjusted = true;
                API.subsequencer.addCue(evt.new.key, [data.start, new_end], data);
                return;
            }


            if (data && typeof(data) == "string") {
                subs.querySelector("span").innerHTML = data.replace("\n", "<br>");
            } else {
                if (!API.options.rendersubs) return;
    
                if (!API.options.advancedsubs && data.who != "info" && data.who != "scene") {
                    let s = subs.querySelector("span");
                    if (s.innerHTML) {
                        // Two people, need to fix this
                        s.innerHTML = "-" + s.innerHTML + "<br>-" + text.replace("\n", "<br>");
                    } else {
                        s.innerHTML += text.replace("\n", "<br>");
                    }
                } else {
                    // More advanced subtitle, make it here
                    try {
                        API._render_advanced_sub(evt.new, subs);
                    } catch (e) { 
                        console.log("Advanced render failed", e);
                    }
                }
            }

            if(subs)
                subs.classList.remove("hidden");
        });

        API.subsequencer.on("remove", evt => {
            who = evt.old.data.who;
            if (who == "scene") { // || who == "info") {
                // This is a bit of information, so it's in a different spot
                API.targetElement.querySelector(".infobox").classList.add("hidden");
                return;
            }

            // Simple subs - just remove it
            if (!API.options.advancedsubs && who != "scene" && who != "info") {
                try {
                    API.targetElement.querySelector(".subtitle span").innerHTML = "";
                } catch (err) {};  // Ignore, it's just cleanup
                //API.targetElement.querySelector(".subtitle").classList.add("hidden");
                return;
            }

            API.targetElement.querySelectorAll(".subtitle #" + evt.key).forEach(i => API.targetElement.querySelector(".subtitle").removeChild(i));
            API.targetElement.querySelectorAll(".screenreadersub #txt_" + evt.key).forEach(i => i.parentElement.removeChild(i));
        });
    }

    // ***************************** TTS engine ****************
    if (API.options.tts) {
        API.speak = function(text, voice, force) {
            if (!force && (API.audiodescriptionElement || !API.targetElement.querySelector("#btnaudiodescription").classList.contains("active")))
                return;

            if (API.options.responsive_voice) {
                _is_speaking++;
                responsiveVoice.speak(text);
                responsiveVoice.fallback_audio.onended = function() {
                  _is_speaking--;

                  if (API.options.tts_autopause && __autopaused) {
                    __autopaused = false;
                    app.to.update({velocity: 1});
                  }
                    console.log("Speech OK");
                };
                return;
            }


            console.log("SPEAK", text);
            return new Promise(function(resolve, reject) {
              if (!force && API.mediaElement.muted) {console.log("NOPE", force); return};  // No talking when muted
                let utterance = new SpeechSynthesisUtterance(text);
                utterance.voice = API.tts_voices[voice || 0];
                utterance.onend = function() {
                  _is_speaking--;

                  if (API.options.tts_autopause && __autopaused) {
                    __autopaused = false;
                    app.to.update({velocity: 1});
                  }
                  resolve();
                };
                _is_speaking++;
                console.log(API.tts_voices, voice || 0, utterance.voice);
                console.log("Speaking", text, "in voice", utterance.voice);
                let s = speechSynthesis.speak(utterance);
            });
        }

        API.tts_voices = [];
        API.tts_ready = new Promise(function(resolve, reject) {

            if (API.options.responsive_voice) {
                // TODO: More languages
                try {
                    responsiveVoice.setDefaultVoice("Norwegian Male");                    
                } catch (err) {
                    API.options.responsive_voice = false;
                    console.log("Responsive voice failed", err);
                }
                resolve("ResponsiveVoice");
                return;
            }

            speechSynthesis.onvoiceschanged = function() {
                let def;
                speechSynthesis.getVoices().forEach(voice => {
                    console.log("VOICE", voice.lang);
                    if (voice.lang.startsWith("en") && !def) def = voice;
                    if (voice.lang.startsWith(API.options.tts_lang || "en")) {
                        if (API.tts_voices.indexOf(voice) == -1) {
                            API.tts_voices.push(voice);
                        }
                    };
                });
                if (API.tts_voices.length == 0 && def)
                    API.tts_voices.push(def);

                console.log("Loaded", API.tts_voices.length, "voices");
                if (API.tts_voices.length > 0) {
                    // API.speak("Ready", 0);
                    console.log("READY");
                    resolve(API.tts_voices);
                } else {
                    reject("No voices");
                }
            };
            speechSynthesis.onvoiceschanged();
        });
    }
    // Load a video file into the video target
    API.load_video = function(info) {
        videotarget = API.targetElement;
        if (!videotarget) return;
        let video = document.createElement("video");


        console.log("Loading video, trad", _traditional, API.options.pos);
        if (_traditional || API.options.pos !== false) {
            video.style.width = "100%";
            video.style.height = "";
            _traditional = true;
            console.log("traditional is ON")
        }

        video.addEventListener("durationchange", () => {console.log("DURATION CHANGE"); if (app.readyState == "open") app.motions.duration.update(video.duration)});
        video.src = info.src;
        video.addEventListener("loadedmetadata", function() {
            API.resize();
            API.resize(videotarget);
            if (app.readystate == "open")
                app.motions.duration.update(video.duration);
        });
        video.classList.add("auto-resize");
        video.classList.add("maincontent");
        video.pos = [50, 50];
        video.sync = MCorp.mediaSync(video, API.to, {
            skew: info.offset || 0
        });
        API.mediaElement = video;
        API.mediaElement.pos = API.mediaElement.pos || [50, 50];
        videotarget.appendChild(video);
        if (API.targetElement.querySelector("#btnsound"))
            API.targetElement.querySelector("#btnsound").style.display = "";

    };

    // Load an audio file into the audio target
    API.load_audio = function(info) {
        console.log("Loading audio", info);
        audiotarget = API.targetElement;
        if (!audiotarget) return;
        let audio = document.createElement("audio");
        audio.src = info.src;
        audio.classList.add("maincontent");
        audio.sync = MCorp.mediaSync(audio, API.to, {
            skew: info.offset || 0
        });
        audio.muted = true;
        audio.sync.pause(true);
        audio.pause()
        API.mediaElement = audio;
        API.mediaElement.pos = API.mediaElement.pos || [50, 50];
        audiotarget.appendChild(audio);
        API.targetElement.querySelector("#btnsound").style.display = "";
    };

    // Load iframe index
    API.load_index = function(url) {
        return new Promise(function(resolve, reject) {
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    API.index = data;

                    // We load these, we use the next frame start as end, and we remember the reference
                    // to the previous and next iframes too for easy lookup
                    console.log("Loading", data.iframes.length, "iframes into index");
                    for (let i = 0; i < data.iframes.length; i++) {
                        let item = {
                            prev: parseFloat(data.iframes[i - 1]),
                            current: parseFloat(data.iframes[i]),
                            next: parseFloat(data.iframes[i + 1])
                        };
                        end = item.current + 1000;
                        if (item.next) end = item.next;
                        let id = "i" + item.current.toFixed(1).replace(".", "-");
                        API.idxsequencer.addCue(id, new TIMINGSRC.Interval(item.current, end), item);
                    }
                    resolve(data);
                });
        });

    }

    // Load iframe index
    API.load_voice_index = function(url) {
        return new Promise(function(resolve, reject) {
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    API.voice_index = data;
                    resolve(data);
                });
        });
    }

    API.load_audiodescription = function(url) {
        if (!API.audiodescriptionElement) {
            API.audiodescriptionElement = document.createElement("audio");
            API.audiodescription_sync = MCorp.mediaSync(API.audiodescriptionElement, API.to);
        }
        API.audiodescriptionElement.src = url;
        API.audiodescriptionElement.muted = false;
        API.audiodescription_sync.pause(true);
        console.log("audiodescription loaded");
        if (API.targetElement.querySelector("#btnaudiodescription"))
            API.targetElement.querySelector("#btnaudiodescription").style.display = "";
    }

    // Load a manifest
    API.load = function(url, mediatarget, options) {
        if (API.options.video) {
            if (!API.mediaElement) {
                // Bind click to toggle controls
                API.targetElement.addEventListener("click", evt => {
                  showControls();
                });

                API.targetElement.addEventListener("dblclick", evt => {
                    API.toggle_fullscreen(API.targetElement);
                });
            }
        }
        API.mediaElement = null;  // document.querySelector(mediatarget);
        // console.log("TargetElement is", API.targetElement);

        if (API.targetElement.querySelector("#btnsound"))
            API.targetElement.querySelector("#btnsound").style.display = "none";
        if (API.targetElement.querySelector("#btnaudiodescription"))
            API.targetElement.querySelector("#btnaudiodescription").style.display = "none";


        options = options || {};
        return new Promise(function(resolve, reject) {

            let promises = [];

            let p = fetch(url);
            promises.push(p);
            p.then(response => response.json())
            .then(data => {
                if (data.synstolk) data.audiodescription = data.synstolk;  // Backwards compatibility

                API.manifest = data;

                if (data.options) {
                    for (let k in API.options) {
                        if (data.options[k] !== undefined) {
                            console.log("Checking option", k, API.options[k], default_options[k])
                            if (API.options[k] != default_options[k])
                                continue;  // Overridden by the player

                            console.log("Option from manifest:", k, data.options[k]);
                            API.options[k] = data.options[k];
                        }
                    }
                }

                if (mediatarget && API.options.video)
                    API.load_video(data.video, mediatarget);
                if ((!data.video && data.audio) || (API.options.video == false && data.audio)) {
                    if (API.options.audio)
                        API.load_audio(data.audio, mediatarget);
                }

                if (API.manifest.poster) {
                    document.querySelector(".overlay").style.backgroundImage = "url('" + API.manifest.poster + "')";
                }

                let s = data.subtitles;
                if (!API.options.advancedsubs && data.normalsubtitles)
                    s = data.normalsubtitles;

                if (s)
                    s.forEach(subtitle => {
                        if (subtitle.src.indexOf(".json") > -1) {
                            promises.push(API.load_json_subs(API.subsequencer, subtitle.src, subtitle));
                        } else {
                            promises.push(API.load_subs(API.subsequencer, subtitle.src));
                        }
                    });

                if (data.pip && API.options.pip) {
                    API.targetElement.querySelector(".pip").src = data.pip.src;
                    API.targetElement.querySelectorAll(".pipctrl").forEach(p => p.style.display = "inline-block");
                } else {
                  // Disable pip stuff
                  API.targetElement.querySelectorAll(".pipctrl").forEach(p => p.style.display = "none");
                }

                if (data.cast) {
                    let p2 = fetch(data.cast);
                    p2.then(response => response.json())
                    .then(response => {
                        API.cast = {};
                        for (var k in response) API.cast[String(k).toLowerCase()] = response[k];
                    });
                    promises.push(p2);
                } else {
                    API.cast = {};
                }

                // Do we also have audiodescription audio?
                if (data.audiodescription && API.options.audiodescription) {
                    API.load_audiodescription(data.audiodescription);
                } else {
                    // Disable button
                    if (API.targetElement.querySelector("#btnaudiodescription"))
                        API.targetElement.querySelector("#btnaudiodescription").classList.add("hidden");
                }

                if (data.index && API.options.index) {
                    promises.push(API.load_index(data.index));
                }

                if (data.voiceindex && API.options.voice_index) {
                    console.log("Loading voice index");
                    promises.push(API.load_voice_index(data.voiceindex));
                }

                if (data.aux) {
                    let p2 = fetch(data.aux);
                    p2.then(response => response.json())
                    .then(response => {
                        response.forEach(item => {
                            item.type = "aux";
                            API.sequencer.addCue(String(Math.random()), new TIMINGSRC.Interval(item.start, item.end), item);
                        });
                    });
                    promises.push(p2);
                }

                if (data.tracking) {
                    console.log("Load tracking data");
                    let p2 = fetch(data.tracking);
                    p2.then(response => response.json())
                    .then(response => {
                        response.forEach(item => {
                            item.type = "tracking";
                            item.start = item.t - 1.0;
                            item.end = item.start + 2.0;
                            API.sequencer.addCue("t" + String(Math.random().toString(36).substr(2)), new TIMINGSRC.Interval(item.start, item.end), item);
                        });
                    });
                    promises.push(p2);
                }

                if (data.dc) {
                    try {
                        console.log("Using datacannon", data.dc)
                        API.dcannon = new DataCannon("wss://nlive.no/dc", [API.sequencer]);
                        API.dcannon.ready.then(function() {
                            API.dcannon.subscribe(data.dc)
                        });
                    } catch (e) {
                        console.log("DC suggested but can't be used");
                    }
                } else {
                    // We load this into a sequencer lickety split
                    data.cues = data.cues || [];
                    let i = 0;
                    data.cues.forEach(item => {
                        if (!options.dataonly)
                            item.target = mediatarget;
                        if (!item.end) {
                            console.log("MISSING ITEM STOP");
                        }
                        let id = "c" + item.start.toFixed(1).replace(".", "-");
                        API.sequencer.addCue(id, new TIMINGSRC.Interval(item.start, item.end || item.start), item);
                        i++;
                    });
                }

                Promise.all(promises).then(() => resolve(data));
            });
        });
    };


    let moveid = 1; // We need to handle multiple moves before they stop
    let move = function(element, targets, time, scene_change) {

        element.style.transition = "";
        if (time) {
            let t = "";
            for (let target in targets) {
                console.log("Adding target", target);
                t += target + " " + time/1000. + "s,";
            }
            element.style.transition = "all " + time/1000. + "s ease";
            console.log("Transision is", t, element.style.transition);
        }

        if (time == 0 || 1) {
            for (let target in targets) {
                element.style[target] = targets[target];
            }
            return;
        }
        moveid++;
        // targets should be a property map, e.g. {height: "80px", width: "50%"}
        time = time || 1000;
        let state = {};

        for (let target in targets) {
            state[target] = {};
            let val = target[target];
            let info = /(-?\d+)(.*)/.exec(targets[target]);
            let curinfo = /(-?\d+)(.*)/.exec(element.style[target]);
            if (!curinfo) curinfo = [0, 0, "px"];
            state[target].what = info[2];
            state[target].sval = parseInt(curinfo[1]);
            state[target].tval = parseInt(info[1]);
            state[target].val = parseInt(curinfo[1]);
            state[target].diff = state[target].tval - state[target].sval;
        };
        let endtime = performance.now() + time; // API.to.pos + (time / 1000.);




        let theid = moveid;
        let update = function() {
                // Callback on time
                if (theid != moveid) {
                    return;
                }
                let done = false;
                let now = performance.now(); // API.to.pos;

                if (now >= endtime) {
                    for (let target in targets) {
                        element.style[target] = state[target].tval + state[target].what;
                    }
                    return; // we're done
                }
                let cur_pos = 1 - (endtime - now) / time;
                for (let target in targets) {
                    if (element.style[target] == state[target].tval + state[target].what)
                        continue;

                    // what's the target value supposed to be

                    let v = state[target].sval + (state[target].diff * cur_pos);
                    element.style[target] = Math.floor(v) + state[target].what;
                }

                //movetimeout = setTimeout(update, 100);
                requestAnimationFrame(update);
            }
            //movetimeout = setTimeout(update, 100);
        requestAnimationFrame(update);
    }

    // Handle resizing things
    let _resize_timer;
    API.resize = function(what, force) {

        if (force === undefined) force = true;

        // If we're using "traditional" mode, just show the whole thing, resize
        // the videocontainer to the video size
        if (_traditional) {
            API.targetElement.style.height = API.mediaElement.clientHeight + "px";
            API.mediaElement.style.left = "";
            API.mediaElement.style.top = "";
            API.mediaElement.classList.remove("landscape");
            API.mediaElement.classList.remove("portrait");
            return;
        }

        if (what == document.querySelector("body")) throw new Error("Resize body!");
        if (!what) {
            let ar = API.targetElement.querySelectorAll(".auto-resize");
            ar.forEach(a => API.resize(a.parentElement, force));
            return;
        }

        let items = what.querySelectorAll(".auto-resize");
        let width = what.clientWidth;
        let height = what.clientHeight;

        let busy = {
            tl: false,
            bl: false,
            tr: false,
            br: false,
            l: false,
            r: false
        };

        // Resize pip if active
        if (API.options.pip) {
            let item = API.targetElement.querySelector(".pip");
            let w = item.clientWidth;
            let h = item.clientHeight;

            // First we ensure that the things inside cover the whole thing (but not more)
            let ar = w / h;
            let outer_ar = width / height;
            if (outer_ar < 1) { // Portrait
                item.classList.add("portrait");
                item.classList.remove("landscape");
            } else {
                item.classList.add("landscape");
                item.classList.remove("portrait");
            }
        }

        items.forEach(item => {
            let w = item.clientWidth;
            let h = item.clientHeight;

            // First we ensure that the things inside cover the whole thing (but not more)
            let ar = w / h;
            let outer_ar = width / height;
            let changed = false;
            // console.log("Outer", width, height, "inner", w, h, "Outer_ar", outer_ar, "ar", ar);
            if (outer_ar < ar) { // 1) { // Portrait
                if (item.classList.contains("landscape")) changed = true;
                item.classList.add("portrait");
                item.classList.remove("landscape");
            } else {
                if (item.classList.contains("portrait")) changed = true;
                item.classList.add("landscape");
                item.classList.remove("portrait");
            }

            if (changed) {
                clearTimeout(_resize_timer);
                _resize_timer = setTimeout(function() {
                    API.resize(what, force);
                }, 1000);
                return;
            }

            // If we're not doing positioning, just return
            if (!API.options.pos) return;

            if (!API.targetElement) return;  //  || !API.targetElement.pos) return;

            item.pos = API.targetElement.pos || [50, 50];
            item.animate = API.targetElement.animate;
            //console.log("Current", API.targetElement.lastPos, "new", item.pos, "force", force, "auto_animate", API.options.auto_animate);
            let ignore = false;

            // Auto-aniumate? Check the last position we had - if we're close,
            // animate, if not, jump. This could also have used the index if
            // available, but that is only good if the index has good scene
            // detection
            if (API.options.auto_animate || item.animate) {
                if (!API.targetElement.lastPos) {
                    API.targetElement.lastPos = item.pos;
                } else if (!force) {
                    let p = [API.targetElement.lastPos[0] - item.pos[0], API.targetElement.lastPos[1] - item.pos[1]];
                    // console.log(API.to.pos, "Pos change", p);
                    if (Math.abs(p[0]) <= API.options.animate_ignore[0] && Math.abs(p[1]) <= API.options.animate_ignore[1]) {
                       // console.log("Ignoring too small change");
                        // Ignore - too small change
                        ignore = true;
                    } else {
                        if (Math.abs(p[0]) <= API.options.animate_limit[0] && Math.abs(p[0]) <= API.options.animate_limit[1]) {
                            item.animate = true;
                            //console.log("Animating");
                            API.targetElement.lastPos = item.pos;
                        }
                    }
                }
            } 


            // Which quadrant and halfs of the screen is this in - flag it
            let pos = API.targetElement.pos || [50, 50];
            if (pos[0] < 45) {
                if (pos[1] <= 60) busy.tl = true;
                if (pos[1] >= 40) busy.bl = true;
                busy.l = true;
            } else {
                if (pos[0] >= 55) {
                    if (pos[1] <= 60) busy.tr = true;
                    if (pos[1] >= 40) busy.br = true;
                    busy.r = true;
                }
            }

            if (API.options.pip && API.options.pipskew && busy.r) {
                // We're skewing the video if interesting on the right
                // 80% of the pip
                width = width - (API.targetElement.querySelector(".pip").clientWidth * 0.7);
                // width = width * 0.7;
            }

            // Find the offsets
            let Tx = (item.pos[0] / 100.) * w;
            let Ty = (item.pos[1] / 100.) * h;
            // Selection right corner
            let Sx = Tx - (width / 2.);
            let Sy = Ty - (height / 2.);

            // We now have the corner point, but we want the whole content to be
            // within, so don't go beyond what's necessary
            let overflow_x = w - width;
            let overflow_y = h - height;

            // maximum adjustment of the overflow, or we'll go outside
            let offset_x = -Math.max(0, Math.min(overflow_x, Sx));
            let offset_y = -Math.max(0, Math.min(overflow_y, Sy));
            if (!ignore || force) {
                move(item, {
                    left: Math.floor(offset_x) + "px",
                    top: Math.floor(offset_y) + "px"
                }, item.animate ? 1000 : 0);
                API.targetElement.lastPos = item.pos;
            }

            // Markingbox position too
            if (0 && API.options.markingbox) {
                let mbox = API.targetElement.querySelector(".markingbox");
                if (mbox) {
                    // Center point of box relative to visible part
                    mbox.style.left = Math.floor(Tx + offset_x - (mbox.clientWidth / 2.)) + "px";
                    mbox.style.top = Math.floor(Ty + offset_y - (mbox.clientHeight / 2.)) + "px";
                } else {
                  console.log("***Missing markingbox");
                }
            } else {
                // console.log("Markingbox not enabled");
            }

            if (!API.options.pippos) return;

            // Put the PIP at the correct place (if applicable);
            if (API.options.pippos) {
                let pip = API.targetElement.querySelector(".pip");
                // Split in left/right, not quadrants
                let positions = ["r", "l"];
                if (busy[API.lastpippos] != false) {
                    // Must move it
                    for (let i in positions) {
                        let pos = positions[i];
                        if (!busy[pos]) {
                            // Move here
                            if (pos == "r") {
                                pip.classList.remove("pipleft");
                            } else {
                                pip.classList.add("pipleft");
                            }
                            break;
                        }
                    }
                }
            }
        });
    }

    window.addEventListener("resize", function() {
        setTimeout(() => app.resize(null, true), 0);
    });


    API.set_subtitle = function(subtitle) {
        let target = API.targetElement.querySelector(".subtitle");
        target.innerHTML = subtitle;
        if (!subtitle) {
            target.classList.add("hidden")
        } else {
            target.classList.remove("hidden")
            return target;
        }
    }

    let set_overlay = function(data) {
        data = data || {};
        let target = API.targetElement.querySelector(".overlay");
        target.querySelector(".name").innerHTML = data.name || "";
        target.querySelector(".title").innerHTML = data.title || "";

        if (!data.name) {
            target.classList.add("hidden")
        } else {
            target.classList.remove("hidden")
            return target;
        }
    }

    API.toggle_fullscreen = function(target, cancel) {
      target = API.targetElement;
        if (cancel) {
            if (document.fullscreenEnabled && document.cancelFullscreen) {
                document.cancelFullscreen();
            }
            return;
        }
        target.requestFullScreen = target.requestFullScreen || target.mozRequestFullScreen || target.webkitRequestFullScreen;
        document.cancelFullscreen = document.cancelFullscreen || document.mozCancelFullScreen || document.webkitCancelFullScreen;
        target.requestFullScreen();
        if (document.fullscreenEnabled || document.mozFullscreenEnabled || document.webkitIsFullScreen) {
            console.log("Cancelling fullscreen");
            document.cancelFullscreen();
        } else {
            target.requestFullScreen();
            console.log("Requesting fullscreen");
        }
    };

    // ********************  Keyboard mapping ************
    if (options.keyboard) {
        document.querySelector("body").addEventListener("keydown", evt => {
            let delta = 15;
            if (evt.ctrlKey) delta = 60;
            if (evt.shiftKey) delta = 1;

            if (evt.keyCode == 32) {
                evt.preventDefault();
                if (app.to.vel == 0) {
                    app.to.update({
                        velocity: 1
                    });
                } else {
                    app.to.update({
                        velocity: 0,
                        position: app.to.pos
                    });
                }
            } else if (evt.keyCode == 37) {
                app.to.update({
                    position: app.to.pos - delta
                });
            } else if (evt.keyCode == 39) {
                app.to.update({
                    position: app.to.pos + delta
                });
            } else if (evt.key.toLowerCase() == "f") {
                API.toggle_fullscreen();
            } else if (evt.key.toLowerCase() == "s") {
                toggle_sound();
            }


            // We can also learn reading speeds by pressing "enter" - it will
            // use the current time - start position of the visible
            // subtitle, and average that into a reading speed
            if (evt.keyCode == 13) {
                let s = API.subsequencer.getActiveCues();
                try {
                    if (s) {
                        let delta_t = API.to.pos - s[0].data.start;
                        let chars = 0;
                        s.forEach(d => chars += d.data.text.length);
                        let speed = chars / delta_t;
                        console.log("Reading speed", speed, "cps");
                        if (Math.abs(API.read_speed - speed) > API.read_speed) {
                            console.log("Ignoring");
                        } else {
                            API.read_speed = API.read_speed * 0.8 + speed * 0.2;
                            console.log("API.read_speed", API.read_speed);
                        }
                    }

                } catch (e) {  // Ignore - sub likely not showing any more
                }
            }
        });
    }

    // Load webvtt subtitles
    API.load_subs = function(sequencer, url, params) {

        var toTs = function(str) {
            var parts = str.split(":");
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
        };

        return new Promise(function(resolve, reject) {
            fetch(url)
                .then(response => response.text())
                .then(webvtt => {
                    var key;
                    var start;
                    var end;
                    var text = "";
                    var lines = webvtt.split("\n");
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        var m = /(\d\d:\d\d:\d\d.\d+)\s?-->\s?(\d\d:\d\d:\d\d.\d+)/.exec(line);
                        if (m) {
                            start = toTs(m[1]);
                            end = toTs(m[2]);
                            continue;
                        }
                        if (line === "") {
                            // STORE IT
                            if (key) {
                                sequencer.addCue("sub" + key, new TIMINGSRC.Interval(start, end), text);
                                key = undefined;
                                text = "";
                            }
                            continue;
                        }

                        // Is this a key?
                        if (/^\d+/.exec(line)) {
                            key = line;
                            continue;
                        }

                        if (key) {
                            text += line + "\n";
                            continue;
                        }
                    }
                    resolve();
                }).catch(err => reject(err));
        });
    };

    // Load json subtitles (start, end, text) + any other data
    API.load_json_subs = function(sequencer, url, params) {
        let idx = 0;
        let p = fetch(url);
        p.then(response => response.json())
            .then(data => {
                data.forEach(sub => {
                    let id = "sub" + idx;
                    idx++;
                    if (sub.start > sub.end) {
                        console.log("ERROR - SUB ENDS BEFORE START", sub);
                        return;
                    }
                    if (sub.who) sub.who = String(sub.who);
                    API.subsequencer.addCue(id, [sub.start, sub.end], sub);
                });
            });
        return p;
    };

    // ************ Render advanced subs - chat style *************
    API._render_advanced_sub = function(data, targetElement) {
        let message = data.data;
        if (!message[API.options.text_track]) return;

        let _make_msg = function(who, text, data) {
            who = String(who).toLowerCase();
            if (!text) throw new Error("Refusing to make message with no text");

            // Text is split for readability, let them stay as they are
            // text = text.replaceAll("-<br>", " ").replaceAll("<br>", " ");

            // console.log("_make_msg", who, text, data, API.cast[who]);

            if (who == "info" || who == "scene") {
                if (API.options.tts) {
                  API.speak(text, data.voice || 0);
                }
                return;
            }
            /*
            if (who == "scene") { // || who == "info") {
                // This is a bit of information, so it's in a different spot
                API.targetElement.querySelector(".infobox").innerHTML = text;
                API.targetElement.querySelector(".infobox").classList.remove("hidden");
                return;
            }
            */

            // It's a text - if we're still speaking, pause the video
            if (API.options.tts && API.options.tts_autopause && _is_speaking) {
                app.to.update({
                    velocity: 0
                });
                __autopaused = true;
            }

            let template = document.querySelector("template#message").content.cloneNode(true);
            let msg = template.querySelector("div");
            msg.setAttribute("id", data.key);
            msg.setAttribute("who", who.replace(" ", "_"))
            if (API.cast[who] === undefined) {
                who = "undefined";
                msg.style.background = "darkgray";
            }
            if (text) {
                if (API.cast[who]) {
                    msg.style.background = API.cast[who].color || "lightgray";
                    msg.querySelector(".icon").src = API.cast[who].src
                } else {
                    msg.querySelector(".icon").src = "undefined.png";
                }
            } else {
                console.log("Hide icon");
                msg.querySelector(".icon").classList.add("hidden");
            }
            // If we have an index - we know there are multiple on screen
            if (data.idx != undefined) {
                if (data.idx % 2 == 1) msg.classList.add("lower")   
                else msg.classList.add("higher");
            } else {
              // Detect if there is another one on screen already
              if (API.targetElement.querySelectorAll(".advancedsub").length > 0) {
                // console.log("Going hi and lo (auto)", API.targetElement, );
                API.targetElement.querySelector(".advancedsub").classList.add("higher");
                msg.classList.add("lower");
              }

            }

            text = text.replace(/^- ?/, "")

            // if (text.startsWith("- ")) text = text.substr(2);
            msg.querySelector(".text").innerHTML = text || "";
            // If right aligned, fix that
            if (data.data.align == "right") {
                msg.classList.add("right");
            }

            if (API.options.subclasses) {
                msg.classList.add(API.options.subclasses);
                msg.querySelector(".text").classList.add(API.options.subclasses);
            }

            // TODO? Trick for a double-sub - the second part is a bit later, so delay it?
            if (data.idx % 2 == 1) {
                let original = msg.style.display;
                msg.style.display = "none";
                setTimeout(function() {
                    msg.style.display = original
                }, API.options.chat_sub_delay * 1000 * data.idx);
            }
            return msg;
        }

        let check_sub = function(who, data) {

            // Check if the given person already has a visible sub
            API.targetElement.querySelectorAll(".subtitle .advancedsub[who='" + String(who).toLowerCase().replace(" ", "_") + "']")
                .forEach(s => API.targetElement.querySelector(".subtitle").removeChild(s));

            // Check if there are any subs that were auto-extended beyond the start of this one
            API.targetElement.querySelectorAll(".subtitle .advancedsub").forEach(s => {
                console.log("Checking", s.getAttribute("id"));
                let cue = API.subsequencer.getCue(s.getAttribute("id"));
                console.log("CHECKING", cue, cue.data.adjusted, cue.data.original_end, data);
                if (cue && cue.data.adjusted && (cue.data.original_end < data.start)) {
                    API.targetElement.querySelector(".subtitle").removeChild(s)
                }
            });

        }

        if (Array.isArray(message.who)) {
            // The sub has multiple messages within them, assume <br> or "- " is the limiter in the text
            let lines = message.text.split("<br>");
            for (let idx = 0; idx < message.who.length; idx++) {
                data.idx = idx;
                let msg = _make_msg(message.who[idx], lines[idx], data);
                if (0 && msg && msg.classList.contains("lower")) {
                    msg.style.opacity = 0.01;
                    setTimeout(() => msg.style.opacity = 1.0, 700);
                }
    
                check_sub(message.who[idx], data.data);

                if (msg) API.targetElement.querySelector(".subtitle").appendChild(msg);
            }
        } else {
            let msg = _make_msg(message.who, message[API.options.text_track], data);

            if (0 && msg && msg.classList.contains("lower")) {
                msg.style.opacity = 0.01;
                setTimeout(() => msg.style.opacity = 1.0, 700);
            }

            check_sub(message.who, data.data);

            if (msg) API.targetElement.querySelector(".subtitle").appendChild(msg);
        }
    };

  var tracking_colors = {};
  var tracking_idx = 0;
  var tracking_palette  = ["#a3a94877", "#edb92e77", "#f8593177", "#3f4fc577", "#00998977", "#ffaaa677", "#f2567977", "#60184877", "#fde47f77", "#1b676b77", "#f0b49e77"];

  API.sequencer.on("change", function(evt) {
    let align = function(element, align) {
      if (!element) return;
      if (align === "right") {
        element.classList.add("rightalign")
      } else {
        element.classList.remove("rightalign")
      }
    };

    let itm = evt.new.data;

    if (itm.type === "tracking" && API.options.show_tracking) {
        function getRandomColor() {
            console.log("Tracking palette", tracking_colors.length, tracking_palette.length);
            return tracking_palette[Object.keys(tracking_colors).length % tracking_palette.length];
          var letters = '0123456789ABCDEF';
          var color = '#';
          for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
          }
          return color + "66";
        }

        let d = document.createElement("div");
        d.classList.add("tracking");
        d.style.left = itm.x + "%";
        d.style.top = itm.y + "%";
        d.setAttribute("id", evt.key);

        if (tracking_colors[itm.s] === undefined) {
            tracking_colors[itm.s] = getRandomColor();
            console.log("COLORS", tracking_colors);
        }
        d.style.background = tracking_colors[itm.s];

        API.targetElement.appendChild(d);
        return;
    }

    if (itm.pos) {
      if (!itm.target) itm.target = ".maincontent";
      let target = API.targetElement.querySelector(itm.target);
      if (target) {
        target.pos = itm.pos;
        API.targetElement.pos = itm.pos;
        target.animate = itm.animate;
        API.targetElement.animate = itm.animate;
        //console.log("Will resize", target.parentElement, target);
        //API.resize(target.parentElement);
        API.resize(null, false);
        API.resize(target, false);

        // Always update
        let mbox = API.targetElement.querySelector(".markingbox");
        mbox.style.left = itm.pos[0] + "%";
        mbox.style.top = itm.pos[1] + "%";

        if (itm.alt) {
            // Got alternative face(s) too!
            itm.alt.forEach(alt => {
                if (alt.posX == itm.pos[0] && alt.posY == itm.pos[1]) return;
                let i = document.createElement("div");
                i.classList.add("markingbox_alt");
                i.classList.add("hidden");
                i.style.left = alt.posX + "%";
                i.style.top = alt.posY + "%";
                API.targetElement.appendChild(i);
            });
        }

        if (API.options.markingbox) {
            API.targetElement.querySelector(".markingbox").classList.remove("hidden");
            API.targetElement.querySelectorAll(".markingbox_alt").forEach(e => e.classList.remove("hidden"));
        }
      }
      /*
      setTimeout(function() {
        console.log("RESIZE");
        API.resize();
      }, 0);
      */
    }

    if (itm.text) {
      align(API.set_subtitle(itm.text), itm.align);
    }

    if (itm.overlay) {
      align(API.set_overlay(itm.overlay), itm.align);
    }

    if (itm.emotion) {
      console.log("Loading emotion", itm, evt.new.key)
      let e = API.targetElement.querySelector(".emotion");
      if (e) {
          e.src = itm.url;
          e.key = evt.new.key;
          e.classList.remove("hidden");
      }
    }
    /*
    if (API.options.markingbox) {
      let box = API.targetElement.querySelector(".markingbox");
      box.style.left = itm.pos[0] + "%";
      box.style.top = itm.pos[1] + "%";
    }
*/
  });


  API.sequencer.on("remove", function(evt) {
    let itm = evt.old.data;
    if (itm.type === "tracking") {
        let d = document.querySelector("#" + evt.key);
        if (d) d.parentElement.removeChild(d);
        return;
    }
    if (itm.text) {
      API.set_subtitle("");;
    }
    if (itm.overlay) {
      API.set_overlay();
    }
    if (itm.emotion) {
      let e = API.targetElement.querySelector(".emotion");
      if (e && e.key == evt.old.key) {
        e.classList.add("hidden");
      }
    }
    if (itm.pos) {
        let m = API.targetElement.querySelector(".markingbox");
        if (m) m.classList.add("hidden");

        m = API.targetElement.querySelectorAll(".markingbox_alt");
        if (m) m.forEach(e => e.parentElement.removeChild(e));
    }
  });



    return API;
}
