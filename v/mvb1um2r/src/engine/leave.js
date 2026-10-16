// أرصدة الإجازات والخصومات الشهرية بتاعتها (مستخرجة من بلوك رأس كل شهر في شيت الفرع).
import { DEFAULT_POLICY,                       } from './policy.js';
import { payrollPeriod } from './month.js';
                                            

                               
                          
                            
                       
 

/**
 * تصنيف الموظف حسب تاريخ التعيين، بالنسبة ليوم 6 من الشهر (عمود T في الشيت):
 * new/new1/new2 = أول 3 شهور ومفيش رصيد، old1 = شهر بداية الاستحقاق ورصيده نسبي، old = رصيد كامل.
 */
                                                              

/** transferredIn: الموظف جاي من فرع تاني في الشهر ده (بيتحدد من تاريخ فروع الموظف، مش من المحرك) */
                                                                                                                                

                              
                                    
                       
                                                                                        
                                                
                                                 
                          
                                                        
                              
                                                           
                               
                                                      
                            
 

const b = (casual        , annual        , sick        )               => ({ casual, annual, sick });

export const DEFAULT_LEAVE_POLICY              = {
  yearly: b(6, 12, 7),
  proratedByMonth: {
    1: b(6, 12, 7), 2: b(6, 11, 7), 3: b(5, 10, 7), 4: b(5, 9, 7), 5: b(4, 8, 7), 6: b(4, 7, 7),
    7: b(3, 6, 7), 8: b(3, 5, 7), 9: b(2, 4, 7), 10: b(2, 3, 7), 11: b(1, 2, 7), 12: b(1, 1, 7),
  },
  tenureCutoffDay: 6,
  resignationBaseDays: 18,
  maxMonthlyUnpaidDays: 30,
  standardMonthDays: 30,
};

const pad = (n        ) => String(n).padStart(2, '0');
const ymd = (y        , m        , d        ) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

export function tenureFor(hireDate                    , year        , month        , policy              = DEFAULT_LEAVE_POLICY)         {
  if (!hireDate) return 'old';
  const cut = (back        ) => ymd(year, month - back, policy.tenureCutoffDay);
  if (hireDate >= cut(0)) return 'new';
  if (hireDate >= cut(1)) return 'new1';
  if (hireDate >= cut(2)) return 'new2';
  if (hireDate < cut(3)) return 'old';
  return 'old1';
}

export const isNewHire = (t        ) => t === 'new' || t === 'new1' || t === 'new2';

/**
 * الرصيد المستحق لحد تاريخ معيّن في السنة (عمود K): 18 يوم في السنة، 3 أيام كل شهرين،
 * بيتضافوا في يوم 1 و21 من الشهر الفردي ويوم 11 من الشهر اللي بعده.
 * من 21 ديسمبر الحسبة بتبدأ من الصفر لأن الفترة دي تبع شهر يناير الحسابي.
 */
export function accruedLeaveDays(date        )         {
  const [y, m, d] = date.split('-').map(Number);
  if (m === 12 && d >= 21) return 0;
  let days = 0;
  for (let odd = 1; odd <= 11; odd += 2) {
    for (const [mm, dd] of [[odd, 1], [odd, 21], [odd + 1, 11]]) {
      if (date >= ymd(y, mm, dd)) days++;
    }
  }
  return days;
}

/**
 * أيام الشهر اللي متشتغلتش بسبب التعيين أو الاستقالة، على أساس شهر 30 يوم (عمود AQ).
 * الشهر الحسابي اللي فيه 31 يوم، أول يوم فيه مش بيتحسب للتعيين وآخر يوم مش بيتحسب للاستقالة.
 * لو أقل من 30 يوم (فبراير)، الأيام الناقصة بتتحسب عند أول الشهر الميلادي.
 */
export function hireResignDays(
  year        , month        , hireDate         , resignationDate         ,
  policy              = DEFAULT_LEAVE_POLICY, attendancePolicy                   = DEFAULT_POLICY,
)         {
  const { days } = payrollPeriod(year, month, attendancePolicy);
  const n = days.length;
  const std = policy.standardMonthDays;
  const monthStart = ymd(year, month, 1);
  const short = Math.max(0, std - n);
  const extra = Math.max(0, n - std);
  // لو التعيين والاستقالة في نفس الشهر الاتنين بيتجمعوا
  let total = 0;
  const hireIdx = hireDate ? days.indexOf(hireDate) : -1;
  if (hireIdx >= 0) total += Math.max(0, hireIdx - extra + (days[hireIdx] >= monthStart ? short : 0));
  const resignIdx = resignationDate ? days.indexOf(resignationDate) : -1;
  if (resignIdx >= 0) total += Math.max(0, n - 1 - resignIdx - extra + (days[resignIdx] < monthStart ? short : 0));
  return total;
}

                                  
               
                
                    
                           
                        
                                               
                                                
                                                             
                                     
                                                                                       
                          
 

                                   
               
                
                 
                           
                                                     
                        
                                                                             
                     
                        
                             
                         
                                                            
                     
                   
                    
                      
                                     
                               
                                                
                         
                             
                                                                                              
 

const zero = ()               => ({ casual: 0, annual: 0, sick: 0 });

export function computeMonthLeave(
  input                 ,
  previous                              ,
  policy              = DEFAULT_LEAVE_POLICY,
  attendancePolicy                   = DEFAULT_POLICY,
)                   {
  const { year, month } = input;
  const n = (t           ) => input.leaveDays[t] ?? 0;
  const adj = { ...zero(), ...input.adjustment };
  const tenure = input.tenureOverride ?? tenureFor(input.hireDate, year, month, policy);
  const fresh = isNewHire(tenure);
  const { from, to } = payrollPeriod(year, month, attendancePolicy);
  const inPeriod = (d         ) => !!d && d >= from && d <= to;

  let status                   = 'active';
  if (inPeriod(input.resignationDate)) status = 'resignedNew';
  else if (inPeriod(input.transferDate)) status = 'transferredNew';
  else if (month > 1 && previous?.status.startsWith('resigned')) status = 'resignedOld';
  else if (month > 1 && previous?.status.startsWith('transferred')) status = 'transferredOld';

  const used = fresh ? zero() : { casual: n('casual'), annual: n('annual'), sick: n('sick') };
  const ms = n('missingStamps');
  const anp = n('absentNoPermission');
  const ann = n('absentNoNotice');

  // الرصيد اللي الشهر بيبدأ بيه
  let opening              ;
  if (fresh) opening = zero();
  else if (tenure === 'old1') opening = policy.proratedByMonth[month];
  else if (month === 1 || !previous) opening = policy.yearly;
  else opening = previous.balance;

  // الأختام الناقصة والغياب بيتخصموا من الاعتيادي بس للموظف اللي ليه رصيد
  const balance               = {
    casual: opening.casual - used.casual - adj.casual,
    annual: opening.annual - used.annual - adj.annual - (fresh ? 0 : ms + anp + ann),
    sick: opening.sick - used.sick - adj.sick,
  };

  const unpaid = fresh ? n('casual') + n('annual') + n('sick') + n('unpaid') : n('unpaid');

  // الموظف الجديد: الأختام الناقصة والغياب بيتخصموا أيام على طول
  const newHire = fresh && status !== 'resignedOld' ? ms + anp + ann : 0;

  // الرصيد السالب بيتخصم ×2، ومن غير الأختام والغياب لأنهم بيتخصموا في بند تاني
  const ca = balance.casual + balance.annual;
  const penalties = ms + anp + ann;
  let negativeBalance = 0;
  if (ca < 0 && balance.sick < 0 && penalties > Math.abs(ca)) negativeBalance = Math.abs(ca + balance.sick * 2);
  else if (!fresh && ca < 0 && balance.sick >= 0) negativeBalance = ca * -2 - penalties;
  else if (!fresh && balance.sick < 0) negativeBalance = (ca + balance.sick) * -2 - penalties;

  // الاستقالة: يرجّع الإجازات اللي أخدها ولسه ماستحقهاش
  const accruedAtResignation = !fresh && inPeriod(input.resignationDate) ? accruedLeaveDays(input.resignationDate ) : 0;
  let resignation = 0;
  if (!fresh && inPeriod(input.resignationDate)) {
    resignation = ca < 0
      ? policy.resignationBaseDays - accruedAtResignation
      : policy.resignationBaseDays - accruedAtResignation - ca;
  }

  return {
    year, month, tenure, status, balance, used,
    missingStamps: ms, absentNoPermission: anp, absentNoNotice: ann,
    unpaidDays: Math.min(policy.maxMonthlyUnpaidDays, unpaid),
    paidDays: Math.min(policy.maxMonthlyUnpaidDays, n('paid')),
    specialDays: n('marriage') + n('bereavement'),
    accruedAtResignation,
    hireResignDays: hireResignDays(year, month, input.hireDate, input.resignationDate, policy, attendancePolicy),
    deduction: {
      newHire, negativeBalance, resignation,
      total: Math.max(0, newHire + negativeBalance + resignation),
    },
  };
}

/** حسبة السنة كلها شهر ورا شهر، كل شهر بيبدأ من رصيد الشهر اللي قبله */
export function computeYearLeave(
  months                   ,
  policy              = DEFAULT_LEAVE_POLICY,
  attendancePolicy                   = DEFAULT_POLICY,
)                     {
  const out                     = [];
  for (const m of [...months].sort((a, b) => a.year - b.year || a.month - b.month)) {
    out.push(computeMonthLeave(m, out.at(-1), policy, attendancePolicy));
  }
  return out;
}
