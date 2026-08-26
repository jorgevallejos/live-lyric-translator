# iPad spike — can the suite run on an iPad?

_**Artefact, not a doc.** Written 2026-08-26. Delete this file once the tests are done and move the
answers into `project-context.md` under `## Discovery`. Not scheduled, and deliberately not before
4 September: even a perfect result changes nothing until the integration is finished._

## The question

Today the show runs on a Mac mini with the Elgato camera and the projector plugged into it. Could an
iPad do the same job, as an extra option rather than a replacement?

The answer depends on four things. **Three of them you can test yourself with hardware you already
own and no code at all.** The fourth needs something built and waits.

---

## Step 0 — check you can even try

Two things to confirm before anything else:

1. **Your iPad has a USB-C port**, not the older Lightning port. If it is Lightning, stop here, the
   answer is no.
2. **You have a USB-C hub** with an HDMI socket and at least one normal USB socket. The iPad has only
   one port, so the camera and the projector and the power all have to share it. If you do not have
   one, this is the only thing you would need to buy, and it is cheap.

---

## Test 1 — does the projector work as a second screen?

**This is the most important one.** Everything else is detail.

1. Connect the iPad to the projector through the hub.
2. Open **Keynote**, open any presentation, and start playing it.
3. Look at both screens.

**What you want to see:** the projector shows the slide, and the iPad shows something *different*,
the presenter view with notes and a timer.

**What it means.** If the two screens show different things, the iPad can do exactly what Pregonero
needs: audience content on the wall, performer controls in your hands. If both screens show the same
thing and nothing you do changes that, the whole idea stops here.

---

## Test 2 — does the iPad see the Elgato camera?

1. Plug the Elgato into the hub, with the iPad connected.
2. Open the **Camera** app, or any video-call app, and look for a way to switch cameras.
3. Then open Safari, go to any "test my webcam" page, and allow it to use the camera.

**What you want to see:** the Elgato picture, in both places.

**What it means.** The Camera app working proves the iPad accepts the hardware. Safari working proves
a web page can use it, which is what Muralista needs to show you the wall. If the Camera app sees it
but Safari does not, that is still a usable answer, it just means more of the work has to be built
rather than reused.

---

## Test 3 — does the pedal work?

1. Pair the Bluetooth pedal with the iPad, in Settings.
2. Open Notes, tap into a note, and press the pedal.

**What you want to see:** the cursor moves, or something visibly happens.

**What it means.** The pedal is your fallback when anything else fails, so it has to work. This is the
test most likely to pass and the one that would hurt most to discover late.

---

## Test 4 — the one that needs building

Whether video plays smoothly inside a shape that has been stretched onto a wall, at projector
resolution. There is no way to check this without an app to check it in, so it waits until the other
three have passed and somebody builds a rough version.

---

## What the answers mean together

| Result | What follows |
|---|---|
| Test 1 fails | The idea is dead. Stop, and you have spent an afternoon. |
| Test 1 passes, 2 and 3 pass | The idea is real. It is still a rewrite of Pregonero's outer layer, which is weeks, but nothing fundamental is in the way. |
| Test 1 passes, test 2 fails in Safari only | Still fine. The camera would be handled by the app itself rather than by a web page. |
| Test 3 fails | Not fatal, but it needs solving before a single real gig. |

**Whatever happens, none of this is worth acting on before one real gig has been played on the
current setup.** That gig is what tells you what an iPad version would need to be good at. Building it
first is guessing.
