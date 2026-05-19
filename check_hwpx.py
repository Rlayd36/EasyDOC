import zipfile, sys, os

fname = "[별지_제25호서식]_임대보증금_일부보증에_대한_임차인_동의서(민간임대주택에_관한_특별법_시행규칙).hwpx"
path = os.path.join(os.path.dirname(__file__), fname)

try:
    with zipfile.ZipFile(path) as z:
        print("ZIP OK, 파일 목록:")
        for n in z.namelist():
            print(" ", n)
        prv = next((n for n in z.namelist() if n.lower() == "preview/prvtext.txt"), None)
        if prv:
            raw = z.read(prv)
            print(f"\nPrvText.txt 크기: {len(raw)} bytes")
            for enc in ("utf-8", "utf-16", "euc-kr", "cp949"):
                try:
                    t = raw.decode(enc).strip()
                    print(f"  {enc} 디코딩 성공, 앞 150자:\n  {t[:150]}")
                    break
                except Exception as ex:
                    print(f"  {enc} 실패: {ex}")
        else:
            print("\nPrvText.txt 없음 — section XML 시도")
            secs = sorted(n for n in z.namelist() if n.lower().startswith("contents/section") and n.endswith(".xml"))
            for s in secs[:2]:
                xml = z.read(s).decode("utf-8", errors="replace")
                print(f"  {s} 앞 300자: {xml[:300]}")
except zipfile.BadZipFile as e:
    print("BadZipFile:", e)
except Exception as e:
    print("Error:", type(e).__name__, e)
