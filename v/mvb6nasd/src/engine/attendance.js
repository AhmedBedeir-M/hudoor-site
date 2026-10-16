import { DEFAULT_POLICY,                       } from './policy.js';
                                                                  

const has = (v                    )              => v !== undefined && v !== null;
const positive = (v        ) => (v > 0 ? v : 0);

/** خصم التأخير: لحد الحد يتضرب ×2، وفوقه ×4 (المضاعفة على التأخير كله، مش الزيادة بس) */
export function latePenalty(lateMin        , policy                   = DEFAULT_POLICY)         {
  return lateMin <= policy.lateThresholdMin
    ? lateMin * policy.lateMultiplierLow
    : lateMin * policy.lateMultiplierHigh;
}

/**
 * حسبة يوم واحد لموظف واحد.
 * @param shiftMin عدد دقايق الشيفت، ومحتاجينه في طريقة الحساب "يومى" بس
 */
export function computeDay(
  day          ,
  method             = 'attendance',
  policy                   = DEFAULT_POLICY,
  shiftMin = 0,
)            {
  const stampsMissing = day.leave === 'missingStamps';
  const scheduled = !day.isWeeklyOff;

  // التأخير: الحضور الرسمي فيه السماح أصلًا، فاللي بيتحسب هو اللي بعد السماح
  let late1 = 0;
  let late2 = 0;
  let earlyLeave = 0;
  if (scheduled && !stampsMissing) {
    if (has(day.actualIn) && has(day.officialIn)) late1 = positive(day.actualIn - day.officialIn);
    if (has(day.actual2In) && has(day.official2In)) late2 = positive(day.actual2In - day.official2In);
    if (has(day.actualOut) && has(day.officialOut) && !day.mission) earlyLeave += positive(day.officialOut - day.actualOut);
    if (has(day.actual2Out) && has(day.official2Out)) earlyLeave += positive(day.official2Out - day.actual2Out);
  }
  // كل فترة ليها مضاعفة لوحدها
  const latePenaltyMin = latePenalty(late1, policy) + latePenalty(late2, policy);

  const permissionPenaltyMin =
    earlyLeave * (day.earlyLeaveIsSick ? policy.sickEarlyLeaveMultiplier : policy.earlyLeaveMultiplier) +
    (day.permissionMin ?? 0) * policy.earlyLeaveMultiplier +
    (day.sickPermissionMin ?? 0) * policy.sickEarlyLeaveMultiplier;

  const prayerExcessMin = positive((day.prayerMin ?? 0) - policy.prayerAllowanceMin);
  const prayerPenaltyMin = prayerExcessMin * policy.prayerExcessMultiplier;
  const breakExcessMin = positive((day.breakMin ?? 0) - policy.breakAllowanceMin);
  const breakPenaltyMin = breakExcessMin * policy.breakExcessMultiplier;

  // نسي يبصم دخول أو خروج: اليوم يوم شغل، والتأخير بيتحسب عادي، والختم اليدوي (4 ساعات) بيتخصم في الجزاءات في التقرير
  const missedPunch = scheduled && !day.leave && !day.mission && !day.open &&
    (has(day.actualIn) !== has(day.actualOut) || has(day.actual2In) !== has(day.actual2Out));
  const punched = (has(day.actualIn) && (has(day.actualOut) || !!day.mission)) || missedPunch;
  const workedMin = has(day.actualIn) && has(day.actualOut)
    ? day.actualOut  - day.actualIn  +
      (has(day.actual2In) && has(day.actual2Out) ? day.actual2Out - day.actual2In : 0)
    : 0;

  let totalMin = 0;
  if (punched) {
    if (missedPunch && method !== 'attendance') {
      // مفيش ساعات شغل متسجلة: بيتحسب يوم كامل، والختم اليدوي بيتخصم لوحده
      totalMin = method === 'daily' ? 0 : shiftMin;
    } else switch (method) {
      case 'attendance':
        totalMin = permissionPenaltyMin + latePenaltyMin + prayerPenaltyMin + breakPenaltyMin;
        break;
      case 'daily':
        totalMin = workedMin > shiftMin ? 0 : shiftMin - (workedMin - prayerPenaltyMin - breakExcessMin);
        break;
      case 'monthlyNoDeduct':
        totalMin = workedMin - prayerPenaltyMin;
        break;
      case 'monthlyDeduct':
        totalMin = workedMin - prayerPenaltyMin - breakExcessMin;
        break;
    }
  }

  return {
    date: day.date,
    lateMin: late1 + late2,
    latePenaltyMin,
    earlyLeaveMin: earlyLeave,
    permissionMin: day.permissionMin ?? 0,
    sickPermissionMin: day.sickPermissionMin ?? 0,
    permissionPenaltyMin,
    prayerExcessMin,
    prayerPenaltyMin,
    breakExcessMin,
    breakPenaltyMin,
    missedPunch,
    workedMin,
    totalMin,
    isWorkDay: stampsMissing || !!day.mission || (punched && !day.leave),
    leave: day.leave,
  };
}
