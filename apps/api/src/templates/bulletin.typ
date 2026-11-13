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

#let fmt-coef(val) = {
  if val == none {
    "—"
  } else {
    let r = calc.round(float(val), digits: 2)
    if r == calc.floor(r) { str(int(r)) } else { str(r) }
  }
}

#let fmt-grade(score, status) = {
  if status == "absent" {
    "ABS"
  } else if status == "excused" {
    "EXC"
  } else {
    fmt(score)
  }
}

#let fmt-rank(r, sex: "M") = {
  if r == none {
    "—"
  } else if r == 1 {
    if sex == "F" { "1ère" } else { "1er" }
  } else {
    str(r) + "e"
  }
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
  margin: (x: 11mm, y: 10mm),
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
    #set text(size: 7.2pt, fill: rgb("#64748b"))
    #line(length: 100%, stroke: 0.4pt + rgb("#cbd5e1"))
    #v(2pt)
    #grid(
      columns: (1fr, auto),
      align: (left, right),
      [Généré le #fmt-date(data.generatedAt) — #data.school.name (#data.academicYearLabel)],
      [Page #counter(page).display("1 / 1", both: true)],
    )
  ],
)

#set text(
  font: ("Liberation Sans", "DejaVu Sans", "Libertinus Serif"),
  size: 8.3pt,
  lang: "fr",
  fill: rgb("#0f172a"),
)

#let render-school-header() = {
  let logo-file = data.at("logoFile", default: none)
  grid(
    columns: (1fr, auto, 1fr),
    gutter: 6pt,
    align: (center, center, center),
    [
      #text(size: 7.5pt, weight: "bold")[#upper(data.school.country)] \
      #text(size: 6.8pt, style: "italic")[Paix - Travail - Patrie] \
      #v(1pt)
      #text(size: 7.2pt, weight: "bold")[#upper(data.school.ministry)] \
      #if data.school.region != "" [
        #text(size: 6.8pt)[Délégation Régionale : #data.school.region] \
      ]
      #if data.school.delegation != "" [
        #text(size: 6.8pt)[Délégation Départementale : #data.school.delegation]
      ]
    ],
    [
      #if logo-file != none {
        image(logo-file, width: 18mm, height: 18mm, fit: "contain")
      } else {
        box(
          width: 16mm,
          height: 16mm,
          stroke: 0.6pt + rgb("#94a3b8"),
          radius: 3pt,
          align(center + horizon, text(size: 6.5pt, fill: rgb("#64748b"))[LOGO]),
        )
      }
    ],
    [
      #text(size: 7.5pt, weight: "bold")[REPUBLIC OF CAMEROON] \
      #text(size: 6.8pt, style: "italic")[Peace - Work - Fatherland] \
      #v(1pt)
      #text(size: 8.5pt, weight: "bold", fill: rgb("#1e3a5f"))[#upper(data.school.name)] \
      #if data.school.motto != "" [
        #text(size: 6.8pt, style: "italic")[« #data.school.motto »] \
      ]
      #if data.school.city != "" or data.school.phone != "" [
        #text(size: 6.8pt)[
          #if data.school.city != "" [#data.school.city]
          #if data.school.city != "" and data.school.phone != "" [ — ]
          #if data.school.phone != "" [Tél : #data.school.phone]
        ]
      ]
    ],
  )
}

#if data.students.len() == 0 [
  #render-school-header()
  #v(12mm)
  #align(center)[
    #box(
      inset: 12pt,
      stroke: 0.8pt + rgb("#cbd5e1"),
      radius: 4pt,
      fill: rgb("#f8fafc"),
    )[
      #text(size: 11pt, weight: "bold")[BULLETIN SCOLAIRE — #data.period.name] \
      #v(4pt)
      Aucun élève actif inscrit dans la classe *#data.classInfo.name* pour l'année *#data.academicYearLabel*.
    ]
  ]
] else [
  #for (idx, student) in data.students.enumerate() {
    if idx > 0 {
      pagebreak()
    }

    render-school-header()
    v(4pt)

    // Period & document title banner
    box(
      width: 100%,
      fill: rgb("#1e3a5f"),
      inset: (x: 8pt, y: 5pt),
      radius: 3pt,
    )[
      #grid(
        columns: (1fr, auto),
        align: (left + horizon, right + horizon),
        [
          #text(fill: white, size: 10.5pt, weight: "bold")[
            BULLETIN DE NOTES — #upper(data.period.name)
          ]
          #h(6pt)
          #text(fill: rgb("#cbd5e1"), size: 8pt)[
            (Année scolaire : #data.academicYearLabel)
          ]
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

    v(4pt)

    // Student identity box
    box(
      width: 100%,
      stroke: 0.6pt + rgb("#94a3b8"),
      fill: rgb("#f8fafc"),
      inset: 6pt,
      radius: 3pt,
    )[
      #grid(
        columns: (1.3fr, 1.3fr, 1fr),
        gutter: 5pt,
        [
          *Nom & Prénoms :* #upper(student.lastName) #student.firstName \
          *Matricule :* #student.matricule \
          *Né(e) le :* #fmt-date(student.birthDate) #if student.birthPlace != "" [à #student.birthPlace]
        ],
        [
          *Classe :* #data.classInfo.name (#data.classInfo.level#if data.classInfo.series != none [ — #data.classInfo.series]) \
          *Effectif :* #student.classSize élèves \
          *Prof. Principal :* #or-dash(data.classInfo.mainTeacherName)
        ],
        [
          *Sexe :* #if student.sex == "F" [Féminin] else [Masculin] \
          *Redoublant :* #if student.isRepeater [Oui] else [Non] \
          *Absences :* #student.absencesHours h
        ],
      )
    ]

    v(5pt)

    let is-trimester = data.period.type == "trimester"
    let seq-headers = if is-trimester and student.subjects.len() > 0 {
      student.subjects.at(0).sequenceScores
    } else {
      ()
    }
    let seq-count = seq-headers.len()
    let total-cols = 1 + seq-count + 6
    let col-widths = (1fr,) + seq-headers.map(_ => 13mm) + (14mm, 11mm, 14mm, 12mm, 15mm, 25mm)
    let col-aligns = (left,) + seq-headers.map(_ => right) + (right, center, right, center, right, left)

    let header-cells = (
      table.cell(align: left)[#text(fill: white, size: 7.7pt, weight: "bold")[Matière / Enseignant]],
    )
    for seq in seq-headers {
      header-cells.push(
        table.cell(align: center)[#text(fill: white, size: 7.7pt, weight: "bold")[#seq.code]],
      )
    }
    header-cells += (
      table.cell(align: center)[#text(fill: white, size: 7.7pt, weight: "bold")[#if is-trimester [Moy.] else [Note]]],
      table.cell(align: center)[#text(fill: white, size: 7.7pt, weight: "bold")[Coef.]],
      table.cell(align: center)[#text(fill: white, size: 7.7pt, weight: "bold")[Total]],
      table.cell(align: center)[#text(fill: white, size: 7.7pt, weight: "bold")[Rang]],
      table.cell(align: center)[#text(fill: white, size: 7.7pt, weight: "bold")[Moy. Cl.]],
      table.cell(align: left)[#text(fill: white, size: 7.7pt, weight: "bold")[Appréciation]],
    )

    let body-cells = ()
    let current-group = "__NONE__"

    for sub in student.subjects {
      let grp = sub.at("subjectGroupName", default: none)
      if grp != none and grp != "" and grp != current-group {
        current-group = grp
        body-cells.push(
          table.cell(
            colspan: total-cols,
            fill: rgb("#e2e8f0"),
            align: left,
          )[#text(size: 7.7pt, weight: "bold", fill: rgb("#1e293b"))[#grp]],
        )
      }

      body-cells.push([
        #text(weight: "bold")[#sub.subjectName]
        #if sub.teacherName != none and sub.teacherName != "" [
          \ #text(size: 6.9pt, fill: rgb("#64748b"))[#sub.teacherName]
        ]
      ])

      for i in range(seq-count) {
        let sq = sub.sequenceScores.at(i, default: none)
        if sq == none {
          body-cells.push([—])
        } else {
          body-cells.push([#fmt-grade(sq.score, sq.status)])
        }
      }

      body-cells.push([*#fmt(sub.average)*])
      body-cells.push([#fmt-coef(sub.coefficient)])
      body-cells.push([#fmt(sub.weightedScore)])
      body-cells.push([#fmt-rank(sub.rank)])
      body-cells.push([#fmt(sub.classAverage)])
      body-cells.push([#text(size: 7.5pt)[#or-dash(sub.appreciation)]])
    }

    body-cells.push(
      table.cell(colspan: 1 + seq-count + 1, align: right, fill: rgb("#f1f5f9"))[*TOTAUX*],
    )
    body-cells.push(
      table.cell(align: center, fill: rgb("#f1f5f9"))[*#fmt-coef(student.totalCoefficient)*],
    )
    body-cells.push(
      table.cell(align: right, fill: rgb("#f1f5f9"))[*#fmt(student.totalPoints)*],
    )
    body-cells.push(
      table.cell(colspan: 3, align: center, fill: rgb("#f1f5f9"))[
        #text(size: 7.5pt)[Taux de réussite classe : #if student.passRate != none [#fmt(student.passRate)%] else [—]]
      ],
    )

    table(
      columns: col-widths,
      align: col-aligns,
      inset: (x: 4pt, y: 3pt),
      stroke: 0.45pt + rgb("#94a3b8"),
      fill: (_, y) => if y == 0 { rgb("#1e3a5f") } else if calc.odd(y) { white } else { rgb("#f8fafc") },
      table.header(..header-cells),
      ..body-cells,
    )

    v(5pt)

    // Summary & Council Decision Block
    grid(
      columns: (1fr, 1.15fr),
      gutter: 6pt,
      box(
        width: 100%,
        stroke: 0.6pt + rgb("#94a3b8"),
        fill: rgb("#f8fafc"),
        inset: 6pt,
        radius: 3pt,
      )[
        #text(size: 8.5pt, weight: "bold", fill: rgb("#1e3a5f"))[SYNTHÈSE DES RÉSULTATS]
        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 3pt,
          [Total Coefficients :], [*#fmt-coef(student.totalCoefficient)*],
          [Total Points :], [*#fmt(student.totalPoints)*],
          [Moyenne Générale :], [*#text(size: 10pt, fill: rgb("#1e3a5f"))[#fmt(student.generalAverage) / 20]*],
          [Rang dans la classe :], [*#fmt-rank(student.rank, sex: student.sex)* sur *#student.classSize*],
          [Moyenne de la classe :], [*#fmt(student.classAverage) / 20*],
          [Min / Max de la classe :], [*#fmt(student.minClassAverage)* / *#fmt(student.maxClassAverage)*],
        )
      ],
      box(
        width: 100%,
        stroke: 0.6pt + rgb("#94a3b8"),
        fill: rgb("#f8fafc"),
        inset: 6pt,
        radius: 3pt,
      )[
        #text(size: 8.5pt, weight: "bold", fill: rgb("#1e3a5f"))[DÉCISION DU CONSEIL DE CLASSE]
        #v(3pt)
        #grid(
          columns: (auto, 1fr),
          gutter: 4pt,
          [Mention :], [*#or-dash(student.autoAppreciation)*],
          [Tableau d'Honneur :], [*#if student.isHonorRoll [Oui (Inscrit)] else [Non]*],
          [Décision du Conseil :], [*#fmt-decision(student.councilDecision)*],
          [Appréciation Générale :], [#or-dash(student.councilAppreciation)],
        )
      ],
    )

    v(6pt)

    // Signatures block
    grid(
      columns: (1fr, 1fr, 1fr),
      gutter: 8pt,
      align: (center, center, center),
      box(width: 100%, height: 22mm, stroke: 0.4pt + rgb("#cbd5e1"), inset: 4pt, radius: 2pt)[
        #text(size: 7.6pt, weight: "bold")[Le Professeur Principal]
        #v(1fr)
        #text(size: 7pt, fill: rgb("#64748b"))[#or-dash(data.classInfo.mainTeacherName)]
      ],
      box(width: 100%, height: 22mm, stroke: 0.4pt + rgb("#cbd5e1"), inset: 4pt, radius: 2pt)[
        #text(size: 7.6pt, weight: "bold")[Le Censeur]
      ],
      box(width: 100%, height: 22mm, stroke: 0.4pt + rgb("#cbd5e1"), inset: 4pt, radius: 2pt)[
        #text(size: 7.6pt, weight: "bold")[Le Proviseur]
      ],
    )
  }
]
