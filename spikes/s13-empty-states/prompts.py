"""빈 화면 그림 한 판(3×2) 프롬프트. 쓰는 법: python prompts.py <A|B> → 프롬프트를 찍는다."""
import sys

SCENES = [
    "an empty inbox tray with a small check mark floating above it (approvals inbox is empty)",
    "an open empty folder with a small plus sign beside it (no projects yet)",
    "a flat timeline / list with a single small play triangle and nothing on it (no runs yet)",
    "a clipboard with an empty checklist and a small clock (no scheduled jobs)",
    "a magnifying glass over a blank card (nothing matches the filter)",
    "two plugs not connected, cable ends apart (no connected apps or workers)",
]

COMMON = (
    "A single image laid out as a 3 by 2 grid of six separate spot illustrations, evenly spaced on a pure white "
    "background, no borders, no text, no letters, no numbers, no shadows, no gradients. All six share exactly the same "
    "style, line weight and scale. Calm, friendly product empty-state illustrations for a business process console. "
    "Scenes, left to right, top to bottom: " + "; ".join(f"{i+1}) {s}" for i, s in enumerate(SCENES)) + ". "
)

STYLES = {
    "A": "Style: minimal monoline outline drawing, pure black lines only, uniform medium stroke with rounded caps, "
    "no fill at all, generous negative space, geometric and simple like a premium icon set enlarged.",
    "C": "Style: small illustrative scenes rather than icons — each scene is a tiny still life on a short horizontal "
    "ground line, with a few related objects (a plant, a cup, stacked papers) around the main object, black outlines "
    "with soft light-grey flat fills, slightly hand-drawn but clean line, gentle and warm, generous negative space. "
    "Arrange as 2 columns by 3 rows.",
    "D": "Style: abstract geometric compositions — each scene is built from soft rounded rectangles, circles and "
    "dotted connector lines like a simplified process diagram, black outlines with one light-grey flat fill, "
    "no realistic objects beyond the named one, airy and modern. Arrange as 2 columns by 3 rows.",
    "B": "Style: flat two-tone — black outlines plus soft light-grey (about 15% grey) flat fill on a few shapes, "
    "uniform medium stroke with rounded caps, simple geometric shapes, generous negative space.",
}

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(COMMON + STYLES[sys.argv[1]])
