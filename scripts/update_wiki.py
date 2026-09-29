import json, re, requests
from bs4 import BeautifulSoup
from pathlib import Path

URL="https://dash.tycoon.community/wiki/index.php/Trucking"
HEADERS={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.141 CitizenFX/1.0.0.36109 Safari/537.36"}

def money(s):
    d=re.sub(r"[^0-9]","",s or "")
    return int(d) if d else 0

def kg(s):
    m=re.search(r"([0-9,]+)\s*kg",s or "",re.I)
    return int(m.group(1).replace(",","")) if m else 0

r=requests.get(URL,headers=HEADERS,timeout=30)
r.raise_for_status()
soup=BeautifulSoup(r.text,"html.parser")
content=soup.select_one("#mw-content-text")
tables=[]
for table in content.find_all("table"):
    rows=[]
    for tr in table.find_all("tr"):
        cells=[c.get_text(" ",strip=True) for c in tr.find_all(["th","td"])]
        if cells: rows.append(cells)
    if rows: tables.append(rows)

out=json.loads(Path("data/trucking.json").read_text(encoding="utf-8"))

# Trailer table
for rows in tables:
    if rows and rows[0][:4]==["Name","Price","Capacity","Level Requirement (Trucking Level)"]:
        trailers=[]
        for row in rows[1:]:
            if len(row)<4: continue
            trailers.append({"name":row[0],"price":money(row[1]),"capacityKg":kg(row[2]),"level":float(row[3])})
        if trailers: out["trailers"]=trailers

# Cargo table
for rows in tables:
    if rows and len(rows[0])>=4 and rows[0][0]=="Cargo" and "Weight" in rows[0] and "Requirements" in " ".join(rows[0]):
        cargo=[]
        for row in rows[1:]:
            if len(row)<4: continue
            m=re.search(r"(\d+)",row[3])
            cargo.append({"name":re.sub(r"\s+\d+$","",row[0]),"weightKg":kg(row[1]),"location":row[2],"level":int(m.group(1)) if m else 1})
        if len(cargo)>=5:
            known={x["name"]:x for x in out.get("cargo",[])}
            for x in cargo: known[x["name"]]=x
            out["cargo"]=list(known.values())
            break

out["source"]=URL
Path("data/trucking.json").write_text(json.dumps(out,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
print("Updated data/trucking.json")
