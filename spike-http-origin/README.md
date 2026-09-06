# SPIKE — does an http shell remove the two framing blockers?

**Throwaway. Never merge, never tag.** Answers the question asked on 2026-09-06 and is then deleted.

Run: `./node_modules/.bin/electron spike-http-origin/main.cjs`

Six cases, all driven from the main process with `frame.executeJavaScript`, results in `RESULTS.json`.

| | shell origin | frame origin | shares localStorage with projection | reaches main process |
|---|---|---|---|---|
| A control (today) | `file://` | `http://127.0.0.1:P` | **no** | **no** |
| B the question | `http://127.0.0.1:P` | same, `:P` | **yes** | **yes**, via `parent.electronAPI` |
| C | `http://127.0.0.1:P` | `http://127.0.0.1:Q` | **yes** | no |
| D | `http://127.0.0.1:P` | same, `:P`, `nodeIntegrationInSubFrames` | yes | yes, own preload |
| E | shell on `:P`, relaunched on `:Q` | — | **does not survive a port change** | — |
| F | `http://127.0.0.1:P` | `:Q`, `nodeIntegrationInSubFrames` | yes | **own preload — leaks to every framed tool** |

A reproduces the recorded defect, which is what makes B credible.
