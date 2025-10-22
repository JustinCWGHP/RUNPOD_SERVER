from pathlib import Path

text = Path("sample_page.html").read_text(encoding="utf-8")
marker = '<div class="pd__space pdp_new_design">'
idx = text.find(marker)
print("idx:", idx)
if idx != -1:
    print(text[idx:idx + 12000])
