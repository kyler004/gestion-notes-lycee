#let data = json("data.json")

#let or-dash(val) = {
  if val == none or val == "" { "—" } else { str(val) }
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

#let fmt-status(st) = {
  if st == "active" { "Actif" }
  else if st == "transferred" { "Transféré(e)" }
  else if st == "dropped" { "Abandon" }
  else { str(st) }
}

#set page(
  paper: "a4",
  margin: (x: 12mm, y: 12mm),
  footer: context [
    #set text(size: 7.5pt, fill: rgb("#64748b"))
    #line(length: 100%, stroke: 0.4pt + rgb("#cbd5e1"))
    #v(2pt)
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [Liste générée le #fmt-date(data.generatedAt) — #data.school.name (#data.academicYearLabel)],
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
      #text(fill: white, size: 11pt, weight: "bold")[
        LISTE OFFICIELLE DES ÉLÈVES — #data.classInfo.name
      ]
    ],
    [
      #text(fill: rgb("#e2e8f0"), size: 8.5pt, weight: "bold")[
        Année scolaire : #data.academicYearLabel
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
    [*Niveau :* #data.classInfo.level #if data.classInfo.series != none [— Série #data.classInfo.series]],
    [*Prof. Principal :* #or-dash(data.classInfo.mainTeacherName)],
    [*Effectif total :* #data.students.len() élève(s)],
  )
]

#v(6pt)

#if data.students.len() == 0 [
  #align(center)[
    #box(inset: 12pt, stroke: 0.6pt + rgb("#cbd5e1"), radius: 3pt)[
      Aucun élève inscrit dans cette classe.
    ]
  ]
] else [
  #let body-cells = ()
  #for st in data.students {
    body-cells.push([#st.order])
    body-cells.push([#st.matricule])
    body-cells.push([*#upper(st.lastName)* #st.firstName])
    body-cells.push([#fmt-date(st.birthDate)])
    body-cells.push([#st.sex])
    body-cells.push([#if st.isRepeater [Oui] else [Non]])
    body-cells.push([#fmt-status(st.status)])
  }

  #table(
    columns: (11mm, 28mm, 1fr, 25mm, 13mm, 21mm, 24mm),
    align: (center, left, left, center, center, center, center),
    inset: (x: 4pt, y: 4pt),
    stroke: 0.45pt + rgb("#94a3b8"),
    fill: (_, y) => if y == 0 { rgb("#1e3a5f") } else if calc.odd(y) { white } else { rgb("#f8fafc") },
    table.header(
      table.cell(align: center)[#text(fill: white, weight: "bold")[N°]],
      table.cell(align: left)[#text(fill: white, weight: "bold")[Matricule]],
      table.cell(align: left)[#text(fill: white, weight: "bold")[Nom & Prénoms]],
      table.cell(align: center)[#text(fill: white, weight: "bold")[Date naiss.]],
      table.cell(align: center)[#text(fill: white, weight: "bold")[Sexe]],
      table.cell(align: center)[#text(fill: white, weight: "bold")[Redoublant]],
      table.cell(align: center)[#text(fill: white, weight: "bold")[Statut]],
    ),
    ..body-cells,
  )

  #v(6pt)
  #let boys = data.students.filter(s => s.sex == "M").len()
  #let girls = data.students.filter(s => s.sex == "F").len()
  #let repeaters = data.students.filter(s => s.isRepeater).len()
  #let active-count = data.students.filter(s => s.status == "active").len()
  #text(size: 8.2pt, fill: rgb("#334155"))[
    *Récapitulatif :* #active-count actif(s) | #boys garçon(s) | #girls fille(s) | #repeaters redoublant(s)
  ]
]
