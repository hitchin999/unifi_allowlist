# Brand sources

`make_brand.py` draws the mark and writes every PNG in
`custom_components/unifi_allowlist/brand/`. The `.svg` files here are what it
produced last, kept for reference.

```bash
pip install cairosvg
python3 make_brand.py          # writes to ./out
cp out/*.png ../custom_components/unifi_allowlist/brand/
```

The wordmark uses **Poppins SemiBold**. Install it, or change `font-family` in
the script, before re-rendering or the text falls back to whatever fontconfig
picks.

The mark is original artwork. It is not the Ubiquiti or UniFi trademark, and
this project is not affiliated with or endorsed by Ubiquiti.

## Layout notes

The lock sits under the arcs in the emitter-dot position rather than across
them, which is what the earlier version did — at 24px the overlapping version
turned into a blob. A mask cuts a hairline gap out of the arcs around the lock
so the shapes never touch, whatever the render size. Keep that mask if you edit
the geometry.
