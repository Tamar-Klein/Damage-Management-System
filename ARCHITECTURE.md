# Sprint 4 — Refactor לארכיטקטורה מבוססת Ownership

## מבנה הפרויקט לאחר ה-Refactor

```
domains/
  store.js                          ← שכבת אחסון משותפת (קובץ reports.json)
  buildings/
    buildingsService.js             ← לוגיקה עסקית — צוות משרד השיכון
    buildingsRouter.js              ← API: /buildings/*
  assessments/
    assessmentsService.js           ← לוגיקה עסקית — צוות השמאים
    assessmentsRouter.js            ← API: /assessments/*
  municipal/
    municipalService.js             ← לוגיקה עסקית — צוות הרשויות המקומיות
    municipalRouter.js              ← API: /municipal/*

server-refactored.js                ← נקודת הכניסה הראשית (Sprint 4)
server.js                           ← גרסה ישנה (שמורה לעיון)
notificationServer.js               ← תשתית שיתופית (שרת הודעות)
returnHomePackageService.js         ← שירות PDF (שמור ב-root, משותף לכל)
```

---

## עקרונות ה-Ownership

### תחום Buildings (משרד השיכון)
**מחזיק ב:** `reporterName`, `address`, `damageType`, `description`, `status`,
`hasDamagePhotos`, `hasEngineerReport`, `eligibilityChecked`, `socialApproval`,
`apartmentCount`, `familyEmail`, `pdfUrl`, `createdAt`

**אחראי על:**
- ניהול נתוני המבנה
- תהליך השיקום (שינוי סטטוס)
- הפקת תיק החזרה לבית
- לוח הבקרה הארצי (חישוב "כשיר לפתיחת יישוב")

**API:**
```
GET    /buildings                       ← רשימת מבנים
POST   /buildings                       ← יצירת מבנה
GET    /buildings/:id                   ← פרטי מבנה
PATCH  /buildings/:id                   ← עדכון שדות
PATCH  /buildings/:id/status            ← שינוי סטטוס
POST   /buildings/:id/return-home-package ← הפקת PDF
GET    /buildings/:id/settlement-readiness ← כשירות לפתיחת יישוב
GET    /buildings/settlement-readiness/all ← כשירות לכל המבנים
```

---

### תחום Assessments (צוות השמאים)
**מחזיק ב:** `appraiserAssessment` (כולו — כל שדה בו)

**אחראי על:**
- קבלת ועדכון הערכות שמאי
- חשיפת תוצאת ההערכה לתחום Buildings דרך API

**API:**
```
GET    /assessments/buildings           ← רשימה לפורטל השמאים
GET    /assessments/buildings/:id       ← הערכה ספציפית
PUT    /assessments/buildings/:id       ← שמירת/עדכון הערכה
```

---

### תחום Municipal (צוות הרשויות המקומיות)
**מחזיק ב:** `municipalApproval` (כולו)

**אחראי על:**
- קבלת ועדכון אישורי הרשות
- חשיפת תוצאת האישור לתחום Buildings דרך API

**API:**
```
GET    /municipal/buildings             ← רשימה לפורטל הרשויות
GET    /municipal/buildings/:id         ← אישור ספציפי
PUT    /municipal/buildings/:id         ← שמירת/עדכון אישור
```

---

## תקשורת בין-תחומית

לוח הבקרה הארצי (`BuildingsService.isReadyForSettlement`) **לא ניגש ישירות** לשדות
`appraiserAssessment` או `municipalApproval`. במקום זאת, הוא קורא לפונקציות השירות:

```javascript
// בתוך BuildingsService:
AssessmentsService.hasAcceptableAssessment(buildingId)   // → boolean
MunicipalService.isApproved(buildingId)                  // → boolean
```

---

## תאימות לממשק הקיים

כל נתיבי ה-`/reports` הישנים ממשיכים לעבוד ולנתב לשירות המתאים:

| נתיב ישן | נתב אל |
|---|---|
| `GET /reports` | `BuildingsService.getAllBuildingsFullView()` |
| `GET /reports/:id` | `BuildingsService.getFullBuildingView()` |
| `PUT /reports/:id/appraiser-assessment` | `AssessmentsService.saveAssessment()` |
| `PUT /reports/:id/municipal-approval` | `MunicipalService.saveApproval()` |

אין שינוי ב-UI, בחוויית המשתמש, בתהליך השיקום, או בהפקת תיק האכלוס.
