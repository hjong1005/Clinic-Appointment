# Customisation

Project settings you can safely tweak without touching application logic.
Each variable lives in the frontend source; change it, save, and refresh the
page — there is no build step.

---

## Calendar hours

The Appointments calendar (Day and Week views) shows a fixed window of the day —
by default **8 AM to 10 PM**. To change it, edit the two constants near the top
of the `<script>` in `web/calendar.html`:

```js
const DAY_START_HOUR = 8    // first hour shown (24-hour clock)
const DAY_END_HOUR   = 22   // closing time     (24-hour clock)
```

- Both values use a 24-hour clock, `0`–`24` (e.g. `7` = 7 AM, `19` = 7 PM, `0` = midnight).
- `DAY_START_HOUR` is the top of the grid; `DAY_END_HOUR` is the bottom.
- Example — a 7 AM–8 PM clinic day: set `DAY_START_HOUR = 7` and `DAY_END_HOUR = 20`.
- Appointments scheduled outside this window are hidden from the grid, so make sure
  the range covers all of your booking times.
