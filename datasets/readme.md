## Datasets produced for 2022 WP4 Hackathon


### Manifest
The manifest contains information and links to other files. It's called <resource>.json

``` 
{
  "id": 871982364,
  "poster": "/path/poster.jpg",
  "video": {
    "src": "/path/resource.mp4"
  },
  "audio": {
    "src": "/path/resource.mp3"
  },
  "subtitles": [
    {"src": "/path/resource_subs.json"}
  ],
  "normalsubtitles": [
    {"src": "/path/resource.vtt"}
  ],
  "index": "/path/resource.idx",
  "synstolk": "/path/resource_synstolk.mp3",
  "aux": "/path/resource_aux.json",
  "cast": "/path/resource_cast.json",
  "info": "/path/resource_info.json",  
}
```

Not all elements need to be present.

  * *id* - Automatically generated random id (integer)
  * *poster* - URL to a poster (cover art) for this resource
  * *video* - Video URL
  * *audio* - Audio URL
  * *subtitles* - List of subtitles (json), can have keys 'src', 'lang'
  * *normalsubtitles* - List of traditional subtitles (vtt, srt), possible keys 'src', 'lang'
  * *index* - Index of iframes
  * *synstolk* - URL to a separate sound file for audio descriptions
  * *aux* - URL to auxillary information (json), typically positioning information
  * *cast* - URL to cast members (json)
  * *info* - URL to timed information (json)
  * *speakers* - URL to speaker information (json)


### Subtitles (json)

Timed subtitles formatted as JSON. It's a list of items, typically called <resource>_subs.json. Times are given in seconds, speaker id is resolved in the 'cast' file.


```
[
 {
  "start": 6.92,
  "end": 13.04,
  "text": "Norsk tekst",
  "text_en": "English text",
  "who": "speaker"
 }
]
```

### Index (json)
List of iframes, typically created by ffmpeg with scene detections, but might be useless for live content as they are periodic. All timestamps are floats in seconds.

```
{"iframes": [ts1, ts2, ts3, ts4]}
```

### aux (json)
AUX might contain multiple types of information typically relating to the represented data. Of particular interest is the "focus point", or the point of the image that is deemed as the "most important". It can also contain AI detections of items etc.

"pos" is the "most important" position, given as % in x and y directions in relations to the original media. For example, 44, 46 in a 1920x1080 video is pixel 845 from the left, 497 from the top.

"items" is a list of detected items. it contains a name (typically a "concept"), a bounding box as a fraction of the original media, relative to top left. "value" is the certainty of the AI (0-1), size is the area covered by the bounding box and the posX, posY are the center point of the box as percentage. Importance is the deemed importance of this item between 0 and 1, higher number is more important.


```
[
 {
  "start": 0,
  "end": 4.04,
  "pos": [
   44,
   46
  ],
  "items": [
   {
    "name": "Building",
    "box": {
     "left": 0.779115617275238,
     "right": 0.8900519609451294,
     "top": 0.1720268875360489,
     "bottom": 0.6563907861709595
    },
    "value": 0.9278021454811096,
    "size": 0.05373355992025086,
    "posX": 83,
    "posY": 41,
    "importance": 0.035610080127390364
   },
   {
    "name": "Building",
    "box": {
     "left": 0.8384250998497009,
     "right": 0.9300466775894165,
     "top": 0.28094640374183655,
     "bottom": 0.6751473546028137
    },
    "value": 0.9078227281570435,
    "size": 0.03611731306437882,
    "posX": 88,
    "posY": 47,
    "importance": 0.023420084057004575
   },
   ...
   ]
 }
]
```

### Cast (json)
Cast is a map of people, where the keys are the speaker IDs. Each cast member has a name, a color and might have an avatar and a description. For auto-generated cast overviews, it might also have 'segments' which contain [start,end] times for the refeence audio determined to be this person.
This is done by detecting continous regions of voice that are deemed the same person. Only a few (1-2) segments are likely per person.

*src* is a URL to an avatar image, typically a round png. Might not be present.
*color* should be unique for each cast member.

Cast can also have a key "extras" which is a list of additional colors..


```
{
 "0": {
  "name": "Sigge",
  "color": "#e0c09aa6",
  "src": "/audio/sigge.png",
  "segments": [
   {
    "file": "/tmp/alex_sigge_545_mono.wav",
    "times": [
     [
      25.64,
      31.14
     ],
     [
      197.54,
      204.04
     ]
    ]
   }
  ]
 },
 "1": {
  "name": "Alex",
  "color": "#c5784ca6",
  "src": "/audio/alex.png",
  "segments": [
   {
    "file": "/tmp/alex_sigge_545_mono.wav",
    "times": [
     [
      160.52,
      166.02
     ],
     [
      318.35,
      323.35
     ]
    ]
   }
  ]
 }
]
```

### info (json)
Info is timed information about the content, for example additional resources. For auto-generated content this contains annotated keywords.

*cards* try to provide information that can be shown, and are currently one of types [PER, LOC, ORG, MISC], which are person, location, organization and other.
Cards might also have a url, which so far are typically either a wikipedia link or a Google maps, suitable for opening in an iframe or equivalent.

Score is the AI score, 0-1, higher is more certain.

```
[
 {
  "start": 0.0,
  "end": 5.36,
  "keywords": [
   "Teatergrillen"
  ],
  "type": "MISC",
  "score": 0.5288795829,
  "card": {
   "keywords": [
    "Teatergrillen"
   ],
   "type": "MISC"
  }
 },
 {
  "start": 5.44,
  "end": 9.4,
  "keywords": [
   "Hugh Grant"
  ],
  "type": "PER",
  "score": 0.9995732903,
  "card": {
   "keywords": [
    "Hugh Grant"
   ],
   "type": "PER",
   "url": "https://no.wikipedia.org/wiki/Hugh_Grant"
  }
 }
]
```

## Processing

Processing is done in multiple steps. It's implemented using CryoCloud from NORCE, a modular, distributed job management system based on a processing graph.

  1. audio extraction. ffmpeg is used to transcode audio to wav files (both stereo and 16hz mono)
  2. voice detection. webrtcvad is used to detect likely segments of human voice. 
  3. transcribe. Whisper is used to transcribe the audio as text. The result is (badly) timed subtitles. Currently only transcription is done, no translation.
  4. speaker identification. Detect who utters the text. This also synchronizes the texts with the audio.
  5. create info cards. Create annotations and try to make info cards.
  6. publish. Create manifest, episode lists and publish to the web.

### Models
For Whisper, we use the "large" model. This is not very quick (about 1x), but provides the best results. For live productions, the "medium" model is likely a better choice. 

Speaker identification uses both whisper (same model as transcription), as
well as "nvidia/speakerverification_en_titanet_large" for voice similarity.
Webrtcvad is used to determine Voice Activation points.

An alternative line uses models from Nasjonalbiblioteket for transcriptions. This is a multi-step process, firstq running "NbAiLab/nb-wav2vec2-1b-bokmaal", then "north/demo-deuncaser-base" transformer to add punctuation, create sentences etc. This line also uses a reformatter to format subtitles more traditionally.

### Re-synchronization
For transcription, Whisper is used. While providing very good texts in many languages, the timestamps are quite crude and often quite wrong. This leads speaker identification to be quite difficult, as the audio and the timed text does not match each other. In order to correct this, our speaker identification module first identifies different speakers (if not provided), then passes audio segments from webrtcvad to Whisper to determine what is being said at the beginning of each segment. If a match can be found in texts relatively close in time, the text is re-timestamped to match the audio segment. Speaker identification then maps identified speakers to the texts.

### Colors
If cover art is provided for an episode, colors are extracted from the image using extcolors, and they are then assigned to speakers. If too dark, they are brightened some, but a better solution might be to skip to the next color. Unused colors are saved in the people file as "extras". If too few colors are available in the art (or no art is provided), random colors are generated.

If existing people have been provided, colors and other information is kept for these persons.

