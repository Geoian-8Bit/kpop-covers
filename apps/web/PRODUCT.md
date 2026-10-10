# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A K-pop dance cover crew (small group of dancers) rehearsing choreography. They watch dance-practice videos
while learning, usually from a laptop in the rehearsal room (keyboard + mouse) or a phone propped on the floor
or a tripod (touch, viewed from a few metres away).

## Product Purpose

Remove the friction of learning a choreography from YouTube: flip the video to mirror mode, slow it down or speed
it up (0.25×–2×), loop the hard part A–B, and save those parts as clips the whole crew can reopen instantly.
Success = a dancer goes from "paste link" to "looping the chorus mirrored at 0.75×" in seconds, and the crew
shares one library of videos and clips.

## Positioning

One place for the crew: mirror, speed and saved A–B clips on top of the original YouTube video (no download),
or on uploaded files, shared per crew with invite codes.

## Operating Context

- Rehearsal room: laptop in front of the group, keyboard shortcuts while dancing; phone propped up, big touch
  targets readable at distance.
- Sources: YouTube links (played through the IFrame API, never downloaded) and uploaded video/audio files
  (≤ 50 MB synced to Supabase Storage, larger kept on the device in IndexedDB).
- Crew model: create a crew or join with an 8-character invite code; everything is shared inside the crew.

## Capabilities and Constraints

- Stack: React 19 + Vite + Tailwind v4 + motion, Supabase (auth, Postgres with RLS, storage), Vercel.
- YouTube may round unsupported playback speeds; the app reports the speed actually applied.
- UI copy is in Spanish.

## Brand Commitments

- Name: Coverscape.
- Binding visual direction from the user: no neon/glow/"AI slop"; modern but rooted in old Japanese/Korean art
  (ukiyo-e, the Great Wave off Kanagawa, old Asian drawings), bento layouts; dark sumi-ink base. Wine/burgundy
  accents were requested originally. Fluid, elastic micro-interactions are wanted.

## Evidence on Hand

No testimonials, users counts or press. Do not fabricate any.

## Product Principles

1. Practice first: the video and its controls always win over decoration.
2. Seconds to loop: every core action (mirror, speed, A/B, save) is one tap or one key.
3. Shared by default: what one dancer saves, the crew can open.
4. Readable at distance on a phone propped on the floor.

## Accessibility & Inclusion

Keyboard-operable studio, visible focus, ≥ 44 px touch targets on primary controls, reduced-motion respected.
