#let data = json("data.json")

#let or-dash(val) = {
  if val == none or val == "" { "—" } else { str(val) }
}

#let fmt(val) = {
  if val == none {
    "—"
  } else {
    let rounded = calc.round(float(val), digits: 2)
    let s = str(rounded)
    if not s.contains(".") {
      s + ".00"
    } else {
      let parts = s.split(".")
      let dec = parts.at(1)
      if dec.len() == 0 {
        parts.at(0) + ".00"
      } else if dec.len() == 1 {
        s + "0"
      } else if dec.len() == 2 {
        s
      } else {
        parts.at(0) + "." + dec.slice(0, 2)
      }
    }
  }
}

#let fmt-rank(r) = {
  if r == none { "—" } else if r == 1 { "1er" } else { str(r) + "e" }
}

#let fmt-date(d) = {
  if d == none or d == "" {
    "—"
  } else {
    let s = str(d)
    let date-part = if s.len() >= 10 { s.slice(0, 10) } else { s }
    let parts = date-part.split("-")
    if parts.len() == 3 {
      parts.at(2) + "/" + parts.at(1) + "/" + parts.at(0)
    } else {
      s
    }
  }
}

#let fmt-decision(d) = {
  if d == "honor_roll" { "Tableau d'Honneur" }
  else if d == "encouragement" { "Encouragements" }
  else if d == "congratulations" { "Félicitations" }
  else if d == "warning" { "Avertissement" }
  else if d == "blame" { "Blâme" }
  else if d == "pass" { "Admis(e) en classe supérieure" }
  else if d == "repeat" { "Redouble" }
  else if d == "expelled" { "Exclu(e)" }
  else { "—" }
}

#set page(
  paper: "a4",
  margin: (x: 12mm, y: 12mm),
  background: if not data.period.isOfficial {
    place(
      center + horizon,
      rotate(
        -35deg,
        text(size: 58pt, weight: "bold", fill: rgb(220, 38, 38, 28))[PROVISOIRE],
      ),
    )
  } else {
    none
  },
  footer: context [
    #set text(size: 7.5pt, fill: rgb("#64748b"))
    #line(length: 100%, stroke: 0.4pt + rgb("#cbd5e1"))
    #v(2pt)
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [Tableau d'Honneur généré le #fmt-date(data.generatedAt) — #data.school.name],
      [Page #counter(page).display("1 / 1", both: true)],
    )
  ],
)

#set text(
  font: ("Liberation Sans", "DejaVu Sans", "Libertinus Serif"),
  size: 8.8pt,
  lang: "fr",
  fill: rgb("#0f172a"),
)

#let logo-file = data.at("logoFile", default: none)

#grid(
  columns: (1fr, auto, 1fr),
  gutter: 6pt,
  align: (center, center, center),
  [
    #text(size: 7.5pt, weight: "bold")[#upper(data.school.country)] \
    #text(size: 6.8pt, style: "italic")[Paix - Travail - Patrie] \
    #v(1pt)
    #text(size: 7.2pt, weight: "bold")[#upper(data.school.ministry)] \
    #if data.school.delegation != "" [
      #text(size: 6.8pt)[#data.school.delegation]
    ]
  ],
  [
    #if logo-file != none {
      image(logo-file, width: 17mm, height: 17mm, fit: "contain")
    }
  ],
  [
    #text(size: 7.5pt, weight: "bold")[REPUBLIC OF CAMEROON] \
    #text(size: 6.8pt, style: "italic")[Peace - Work - Fatherland] \
    #v(1pt)
    #text(size: 8.8pt, weight: "bold", fill: rgb("#1e3a5f"))[#upper(data.school.name)] \
    #if data.school.city != "" [
      #text(size: 7pt)[#data.school.city]
    ]
  ],
)

#v(6pt)

#box(
  width: 100%,
  fill: rgb("#1e3a5f"),
  inset: (x: 8pt, y: 6pt),
  radius: 3pt,
)[
  #grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    [
      #text(fill: white, size: 11.5pt, weight: "bold")[
        TABLEAU D'HONNEUR — #upper(data.period.name)
      ]
      #h(6pt)
      #text(fill: rgb("#cbd5e1"), size: 8.5pt)[(#data.academicYearLabel)]
    ],
    [
      #if not data.period.isOfficial [
        #box(
          fill: rgb("#dc2626"),
          inset: (x: 6pt, y: 2pt),
          radius: 2pt,
        )[#text(fill: white, size: 7.5pt, weight: "bold")[PROVISOIRE]]
      ] else [
        #box(
          fill: rgb("#15803d"),
          inset: (x: 6pt, y: 2pt),
          radius: 2pt,
        )[#text(fill: white, size: 7.5pt, weight: "bold")[OFFICIEL]]
      ]
    ],
  )
]

#v(5pt)

#box(
  width: 100%,
  stroke: 0.5pt + rgb("#cbd5e1"),
  fill: rgb("#f8fafc"),
  inset: 6pt,
  radius: 3pt,
)[
  #grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 6pt,
    [*Classe :* #data.classInfo.name (#data.classInfo.level)],
    [*Seuil d'admission :* #fmt(data.honorRollThreshold) / 20],
    [*Lauréat(e)s :* #data.entries.len()],
  )
]

#v(6pt)

#if data.entries.len() == 0 [
  #align(center)[
    #box(inset: 14pt, stroke: 0.6pt + rgb("#cbd5e1"), radius: 3pt, fill: rgb("#f8fafc"))[
      Aucun élève inscrit au Tableau d'Honneur pour cette période (seuil : #fmt(data.honorRollThreshold) / 20).
    ]
  ]
] else [
  #let body-cells = ()
  #for entry in data.entries {
    body-cells.push([*#fmt-rank(entry.rank)*])
    body-cells.push([#entry.matricule])
    body-cells.push([*#entry.fullName*])
    body-cells.push([*#fmt(entry.generalAverage) / 20*])
    body-cells.push([#or-dash(entry.appreciation)])
    body-cells.push([#fmt-decision(entry.councilDecision)])
  }

  #table(
    columns: (14mm, 26mm, 1fr, 28mm, 30mm, 34mm),
    align: (center, left, left, right, left, left),
    inset: (x: 5pt, y: 4.5pt),
    stroke: 0.45pt + rgb("#94a3b8"),
    fill: (_, y) => if y == 0 { rgb("#1e3a5f") } else if calc.odd(y) { white } else { rgb("#f8fafc") },
    table.header(
      table.cell(align: center)[#text(fill: white, weight: "bold")[Rang]],
      table.cell(align: left)[#text(fill: white, weight: "bold")[Matricule]],
      table.cell(align: left)[#text(fill: white, weight: "bold")[Nom & Prénoms]],
      table.cell(align: right)[#text(fill: white, weight: "bold")[Moyenne]],
      table.cell(align: left)[#text(fill: white, weight: "bold")[Appréciation]],
      table.cell(align: left)[#text(fill: white, weight: "bold")[Décision]],
    ),
    ..body-cells,
  )
]

#v(12mm)
#grid(
  columns: (1fr, 1fr),
  gutter: 16pt,
  align: (center, center),
  [
    #text(weight: "bold")[Le Censeur]
  ],
  [
    #text(weight: "bold")[Le Proviseur]
  ],
)
