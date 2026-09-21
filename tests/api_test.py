import json, os, urllib.request, urllib.error, http.cookiejar as cj

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8910/api")
ok = fail = 0

def client():
    jar = cj.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)), jar

def call(op, method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with op.open(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def check(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1; print(f"  ok   {label}")
    else:
        fail += 1; print(f"  FAIL {label} {detail}")

admin, _ = client()
family, _ = client()
CODE = "test-verwaltercode-0123456789abcdef"

print("\n== Zugang ==")
s, r = call(admin, "GET", "/data")
check("Daten ohne Anmeldung gesperrt", s == 401, r)

s, r = call(admin, "POST", "/auth/admin", {"code": "falsch", "label": "X"})
check("Falscher Verwaltercode abgewiesen", s == 401, r)

s, r = call(admin, "POST", "/auth/admin", {"code": CODE, "label": "Mein Rechner"})
check("Ersteinrichtung mit Verwaltercode", s == 200 and r["device"]["isAdmin"], r)

s, r = call(admin, "GET", "/session")
check("Angemeldet als Verwalter", r.get("authenticated") and r["device"]["isAdmin"], r)
check("setupNeeded jetzt false", r.get("setupNeeded") is False, r)

print("\n== Einladungslink ==")
s, r = call(admin, "POST", "/invites", {"label": "Oma Erna / iPhone"})
token = r["invite"]["token"]
check("Einladung erzeugt", s == 201 and len(token) > 30, r)

s, r = call(family, "POST", "/auth/redeem", {"token": token})
check("Einladung eingeloest", s == 200 and r["device"]["isAdmin"] is False, r)

s, r = call(family, "GET", "/session")
check("Zweites Geraet angemeldet", r.get("authenticated") is True, r)

other, _ = client()
s, r = call(other, "POST", "/auth/redeem", {"token": token})
check("Token ist verbraucht", s == 401, r)

s, r = call(other, "POST", "/auth/redeem", {"token": "voelligErfunden123"})
check("Erfundener Token abgewiesen", s == 401, r)

s, r = call(family, "GET", "/devices")
check("Familiengeraet darf nicht verwalten", s == 403, r)

s, r = call(admin, "GET", "/devices")
check("Verwalter sieht 2 Geraete", s == 200 and len(r["devices"]) == 2, r)

print("\n== Wiederverwendung ==")
s, r = call(family, "POST", "/doctors", {"kind": "Hausarzt", "name": "Dr. Meier",
                                         "street": "Lindenweg 4", "zip": "54290",
                                         "city": "Trier", "phone": "0651 1234"})
hausarzt = r["doctor"]["id"]
check("Arzt angelegt", s == 201 and r["created"], r)

s, r = call(family, "POST", "/doctors", {"kind": "hausarzt", "name": "DR. MEIER"})
check("Gleicher Arzt -> kein Fehler, vorhandener zurueck",
      s == 200 and r["created"] is False and r["doctor"]["id"] == hausarzt, r)

s, r = call(family, "POST", "/doctors", {"kind": "Zahnarzt", "name": "Dr. Meier"})
zahnarzt = r["doctor"]["id"]
check("Gleicher Name, andere Art -> neuer Eintrag",
      s == 201 and r["created"] and zahnarzt != hausarzt, r)

ids = {}
for table, label in [("allergies", "Penicillin"), ("allergies", "Äpfel"),
                     ("illnesses", "Asthma"), ("illnesses", "Neurodermitis")]:
    s, r = call(family, "POST", "/" + table, {"label": label})
    ids[label] = r["entry"]["id"]
s, r = call(family, "POST", "/allergies", {"label": "  penicillin  "})
check("Allergie doppelt -> vorhandene zurueck",
      s == 200 and r["created"] is False and r["entry"]["id"] == ids["Penicillin"], r)

print("\n== Personen ==")
person = {
    "name": "Mia", "birthdate": "2015-06-01",
    "shoeSize": "35", "clothingSize": "146/152", "trouserSize": "128 slim",
    "doctorIds": [hausarzt, zahnarzt],
    "allergyIds": [ids["Penicillin"], ids["Äpfel"]],
    "illnessIds": [ids["Asthma"]],
    "medications": [
        {"name": "Salbutamol", "strength": "100 µg", "morning": "", "noon": "", "evening": "1 Hub"},
        {"name": "Ibuprofen", "strength": "400 mg", "morning": "1 Tbl.", "noon": "", "evening": "1 Tbl."},
        {"name": "", "strength": "", "morning": "", "noon": "", "evening": ""},
    ],
}
s, r = call(family, "POST", "/persons", person)
mia = r["id"]
p = next(x for x in r["persons"] if x["id"] == mia)
check("Person angelegt", s == 201, r)
check("Zuordnungen gespeichert", len(p["doctorIds"]) == 2 and len(p["allergyIds"]) == 2, p)
check("Leere Medikamentenzeile verworfen", len(p["medications"]) == 2, p["medications"])
check("Reihenfolge der Medikation bleibt", p["medications"][0]["name"] == "Salbutamol", p["medications"])
check("Farbe automatisch vergeben", p["color"].startswith("#"), p)

s, r = call(family, "POST", "/persons", dict(person, name="Anton", birthdate="2011-02-03"))
anton = r["id"]
check("Personen in Anlagereihenfolge",
      [x["name"] for x in r["persons"]] == ["Mia", "Anton"], [x["name"] for x in r["persons"]])

s, r = call(family, "PUT", f"/persons/{mia}", dict(person, name="Mia Sophie", allergyIds=[ids["Äpfel"]]))
p = next(x for x in r["persons"] if x["id"] == mia)
check("Person geaendert", p["name"] == "Mia Sophie" and p["allergyIds"] == [ids["Äpfel"]], p)

print("\n== Sortierung und Validierung ==")
for label in ["Zöliakie", "Ähre", "Beifuß"]:
    call(family, "POST", "/allergies", {"label": label})
s, r = call(family, "GET", "/data")
labels = [a["label"] for a in r["allergies"]]
check("Alphabetisch mit Umlauten (Ä wie A)", labels == sorted(labels, key=lambda x: x.lower()
      .replace("ä","a").replace("ö","o").replace("ü","u").replace("ß","ss")), labels)

s, r = call(family, "PUT", f"/persons/{mia}", dict(person, name=""))
check("Name ist Pflicht", s == 422, r)
s, r = call(family, "PUT", f"/persons/{mia}", dict(person, birthdate="2015-13-45"))
check("Ungueltiges Datum abgewiesen", s == 422, r)
s, r = call(family, "PUT", f"/persons/{mia}", dict(person, birthdate="2999-01-01"))
check("Datum in der Zukunft abgewiesen", s == 422, r)
s, r = call(family, "PUT", f"/persons/{mia}", dict(person,
      medications=[{"name": f"M{i}"} for i in range(31)]))
check("Mehr als 30 Medikamente abgewiesen", s == 422, r)
s, r = call(family, "PUT", f"/persons/{mia}", dict(person, doctorIds=[999999]))
check("Unbekannter Arzt abgewiesen", s == 422, r)

s, r = call(family, "POST", "/persons", dict(person, name="Böser"),
            {"Sec-Fetch-Site": "cross-site"})
check("Fremde Herkunft abgewiesen", s == 403, r)

print("\n== Loeschen ==")
s, r = call(family, "DELETE", f"/persons/{anton}")
check("Person geloescht", s == 200 and len(r["persons"]) == 1, [x["name"] for x in r["persons"]])
check("Aerzte bleiben erhalten", len(r["doctors"]) == 2, r["doctors"])
check("Allergien bleiben erhalten", len(r["allergies"]) >= 5, r["allergies"])

print("\n== Zugang entziehen ==")
devs = call(admin, "GET", "/devices")[1]["devices"]
fam_id = next(d["id"] for d in devs if not d["isAdmin"])
s, r = call(admin, "DELETE", f"/devices/{fam_id}")
check("Zugang entzogen", s == 200, r)
s, r = call(family, "GET", "/data")
check("Entzogenes Geraet sofort gesperrt", s == 401, r)

own = next(d["id"] for d in devs if d["isCurrent"])
s, r = call(admin, "DELETE", f"/devices/{own}")
check("Eigenes Geraet geschuetzt", s == 409, r)
s, r = call(admin, "DELETE", f"/devices/{own}")
check("Letztes Geraet geschuetzt", s == 409, r)

print("\n== Sperre nach Fehlversuchen ==")
attacker, _ = client()
# Die Sperre zaehlt je Besucheradresse; aus diesem Test heraus sind bereits
# Fehlversuche derselben Adresse aufgelaufen (abgelaufene Einladungstoken).
codes = [call(attacker, "POST", "/auth/admin", {"code": f"versuch{i}", "label": "x"})[0]
         for i in range(12)]
check("Sperre greift", 429 in codes, codes)
check("Hoechstens 8 Versuche durchgelassen", codes.count(401) <= 8, codes)
s, r = call(attacker, "POST", "/auth/admin", {"code": CODE, "label": "x"})
check("Auch der richtige Code bleibt gesperrt", s == 429, r)

print(f"\n{ok} bestanden, {fail} fehlgeschlagen")
raise SystemExit(1 if fail else 0)
