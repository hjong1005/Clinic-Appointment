# Importing patients

Bulk-add patients to the database from a spreadsheet, instead of entering them
one at a time. Open the **Patients** page and click **Import** (top right, next
to *+ New patient*).

A starter file lives at
[`web/templates/patient-import-template.csv`](../web/templates/patient-import-template.csv),
and the same file is linked as **Download template** inside the import dialog.

---

## File format

- **CSV** (`.csv`) or **Excel** (`.xlsx`, `.xls`).
- The **first row must be column headers**. Every row below it is one patient.
- Header matching is case-insensitive and ignores spaces, underscores and
  hyphens, so `Full Name`, `full_name` and `FULL-NAME` are all equivalent.
- Only the columns below are read; any extra columns are ignored.

### Columns

| Field              | Accepted header names                                             | Required | Notes |
|--------------------|-------------------------------------------------------------------|----------|-------|
| Full name          | `Full name`, `Name`, `Patient name`, `Fullname`                   | **Yes**  | Rows without a name are skipped. |
| Date of birth      | `Date of birth`, `DOB`, `Birthdate`, `Birth date`                 | No       | Stored as `YYYY-MM-DD` (see below). |
| Gender             | `Gender`, `Sex`                                                   | No       | Normalised to `Male` / `Female` / `Others`. |
| Phone              | `Phone`, `Mobile`, `Contact`, `Phone number`, `Tel`, `Telephone` | No       | |
| Email              | `Email`, `E-mail`, `Email address`                               | No       | |
| Emergency contact  | `Emergency contact`, `Emergency contact name`, `Next of kin`      | No       | |
| Emergency phone    | `Emergency phone`, `Emergency contact phone`, `Emergency number`  | No       | |

### Value handling

- **Dates** — `YYYY-MM-DD` is recommended and always unambiguous. Slashed dates
  (`03/04/1990`) are read **day-first** (3 April 1990). Excel date cells are read
  from their displayed value.
- **Gender** — `M` / `male` → `Male`, `F` / `female` → `Female`, anything else
  non-empty → `Others`.
- **Empty cells** are stored as blank.

---

## Duplicate handling

Before importing, each row is checked against **all existing patients** (active
and archived) and against earlier rows in the same file. A row is treated as a
duplicate — and **skipped** — when either:

- its **name + date of birth** matches an existing patient, or
- its **phone number** (digits only) matches an existing patient.

The dialog reports how many rows are new and how many duplicates will be
skipped, and the final summary shows how many were imported, skipped, and any
rows that failed.

> Duplicate detection reduces accidental re-imports; it is not a guarantee of
> uniqueness. Two genuinely different people who share a name with no date of
> birth and no phone number on file may be flagged. Prefer importing files that
> include a date of birth and/or phone number.

---

## Steps

1. Patients → **Import**.
2. (Optional) **Download template**, fill it in, and save as CSV or Excel.
3. Choose your file. The dialog shows how many patients are ready and how many
   duplicates will be skipped.
4. Click **Import**. The patient list refreshes when it finishes.

Imports go through the same permission checks as the manual form, so the
database (RLS) still enforces who may add patients.
