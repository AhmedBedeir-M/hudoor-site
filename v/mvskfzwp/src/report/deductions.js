// تقرير الخصومات الشهري: صف لكل موظف، بنفس أعمدة "تقرير الخصومات" في شيت الفرع وبنفس ترتيبها.
import { summarizeMonth } from '../engine/month.js';
                                                                                     
                                                                
                                                   

                                 
               
               
                 
               
                  
                    
                        
                           
                                                      
                                  
                                                                            
                       
                     
               
                                                                                  
                         
                                                                                                     
                        
                                                                                                 
                      
                     
                             
                             
                      
                       
                          
 

/** بنود بيدخلها الـ HR أو بتيجي من شيتات تانية (الجزاءات، الإضافي، الطلعات…) */
                                     
                       
                        
                                  
                                
                       
                                                                         
                                                                                                                  
                          
                            
                        
                    
                         
                               
                         
                            
                             
                 
                      
 

                                 
                                                       
                                 
                                              
                      
                                   
                    
                           
                             
                        
                                          
                                
                       
                             
 

export const DEFAULT_RATES                 = {
  mealDeliverySupervisor: 180,
  mealCourier: 50,
  mealExpat: 180,
  supervisionPerTrip: 6,
  tarshoubyPlus: 200,
  manualStampPenaltyMin: 4 * 60,
  overtimeMultiplier: 2,
};

export const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const TENURE_LABEL                         = { new: 'جديد', new1: 'جديد1', new2: 'جديد2', old1: 'قديم1', old: 'قديم' };
export const STATUS_LABEL                                   = {
  active: '-', resignedNew: 'استقاله جديد', resignedOld: 'استقاله قديم', transferredNew: 'منقول جديد', transferredOld: 'منقول قديم',
  transferredIn: 'منقول وارد',
};
export const METHOD_LABEL                             = {
  attendance: 'حضور & انصراف', daily: 'يومى', monthlyNoDeduct: 'شهرى لا يخصم', monthlyDeduct: 'شهري بالخصم',
};

const EXPAT = ['مغترب', 'مغترب غير متفرغ'];
const COURIER = ['مندوب فسبا', 'مندوب طرشوبي بلس'];

/** نوع القيمة عشان التصدير: الدقايق بتطلع ساعات:دقايق */
                                                                       

/** أعمدة التقرير بالترتيب. المفتاح هو اسم الخاصية في DeductionRow */
export const REPORT_COLUMNS = [
  ['code', 'الكود', 'text'], ['month', 'الشهر', 'text'], ['branch', 'الفرع', 'text'], ['name', 'الاســــــــــم', 'text'],
  ['incentive', 'صرف الحافز', 'text'], ['role', 'الوظيفة', 'text'], ['gender', 'النوع', 'text'],
  ['hireDate', 'تاريخ التعيين', 'date'], ['transferDate', 'تاريخ النقل', 'date'], ['resignationDate', 'تاريخ الاستقاله', 'date'],
  ['expatStatus', 'فى حالة التعيين فى فرع خارجى', 'text'], ['status', 'حالة الزميل', 'text'],
  ['statusChangeDeductMin', 'فرق تغيير حاله خصم', 'minutes'], ['statusChangeNightDeductMin', 'فرق تغيير حاله ليلي خصم', 'minutes'],
  ['breakExcessMin', 'فترة راحه', 'minutes'], ['earlyLeaveMin', 'اذن نهاية الشفت', 'minutes'],
  ['sickPermissionMin', 'استئذان مرضي', 'minutes'], ['permissionMin', 'الاستئذان', 'minutes'],
  ['permissionPenaltyMin', 'خصم الاستئذان', 'minutes'], ['lateMin', 'التأخير', 'minutes'], ['latePenaltyMin', 'خصم التأخير', 'minutes'],
  ['prayerExcessMin', 'استئذان الصلاه', 'minutes'], ['prayerPenaltyMin', 'خصم استئذان الصلاة', 'minutes'],
  ['totalDeductionMin', 'اجمالي الخصم', 'minutes'], ['penaltiesMin', 'الجزاءات', 'minutes'],
  ['missedPunches', 'نسيان بصمة (مرات)', 'number'],
  ['overtimeMin', 'الاضافي', 'minutes'], ['overtimeTotalMin', 'اجمالي الاضافي', 'minutes'],
  ['statusChangeOvertimeMin', 'فرق تغيير حاله اضافى', 'minutes'], ['statusChangeNightOvertimeMin', 'فرق تغيير حاله ليلي اضافى', 'minutes'],
  ['casual', 'عارضة', 'number'], ['annual', 'اعتيادي', 'number'], ['sick', 'مرضي', 'number'],
  ['absentNoPermission', 'غياب بدون اذن ×2', 'number'], ['absentNoNotice', 'غياب بدون علم ×4', 'number'],
  ['missingStamps', 'اختام ناقصة', 'number'], ['unpaid', 'بدون مرتب', 'number'], ['paid', 'اجازة مدفوعة الاجر', 'number'],
  ['hireResignDays', 'تعيينات & استقالات', 'number'], ['weeklyOffDeducted', 'اجازه اسبوعيه بالخصم', 'text'],
  ['reservedSalary', 'المرتب المحجوز', 'text'], ['otherNotes', 'ملاحظات اخرى', 'text'], ['notes', 'ملاحظات', 'text'],
  ['mealDays', 'بدل الوجبة باليوم', 'number'], ['mealAmount', 'بدل الوجبة بالجنيه', 'money'],
  ['shiftFrom', 'مواعيد من', 'clock'], ['shiftTo', 'مواعيد الى', 'clock'], ['shiftHours', 'عدد ساعات العمل', 'number'],
  ['nightHours', 'عدد الساعات الليليه', 'number'], ['workDays', 'عدد ايام العمل', 'number'],
  ['supervisionTrips', 'بدل الاشراف', 'number'], ['supervisionAmount', 'بدل الاشراف بالجنيه', 'money'],
  ['deliveryTrips', 'عدد الطلعات', 'number'], ['deliveryTripsAmount', 'الطلعات بالجنيه', 'money'],
  ['tripsTotal', 'اجمالى الطلعات', 'number'], ['tripsTotalAmount', 'اجمالى الطلعات بالجنيه', 'money'],
  ['tarshoubyPlusDays', 'بدل طرشوبى بلس', 'number'], ['nursingAmount', 'بدل خدمة التمريض', 'money'],
  ['basicDeductionMin', 'خصم الاساسي', 'minutes'], ['specialLeave', 'اجازة الوفاة / العيد / الزواج', 'number'],
  ['courierDeductionMin', 'خصم الفسبا', 'minutes'], ['accruedAtResignation', 'الرصيد المستحق', 'number'],
  ['leaveDeduction', 'خصم تصفية الاجازات', 'number'], ['weeklyOff', 'الأجازة الاسبوعية', 'text'], ['tenure', 'زميل جديد', 'text'],
  ['balanceCasual', 'عارضة (الرصيد)', 'number'], ['balanceAnnual', 'اعتيادي (الرصيد)', 'number'], ['balanceSick', 'مرضي (الرصيد)', 'number'],
  ['monthlyRequiredMin', 'الساعات المطلوبة في الشهر', 'minutes'], ['monthlyActualMin', 'الساعات الفعلية في الشهر', 'minutes'],
]                                                                ;

                                                                                                      

export function buildDeductionRow(
  emp                ,
  year        ,
  month        ,
  days             ,
  leave                  ,
  manual                     = {},
  rates                 = DEFAULT_RATES,
)               {
  const s = summarizeMonth(days);
  const monthly = monthlyHoursCheck(emp, days, leave);
  const attendance = emp.method === 'attendance' && !monthly;
  const only = (v        ) => (attendance ? v : 0);
  const shiftMin = emp.contractHours !== undefined ? emp.contractHours * 60 : emp.shift.endMin - emp.shift.startMin;

  // إجمالي الخصم: حضور وانصراف ويومي = مجموع الأيام. شهري بالخصم = نقص الساعات عن المطلوب
  let totalDeductionMin = 0;
  if (monthly) totalDeductionMin = Math.max(0, monthly.requiredMin - monthly.actualMin);
  else if (emp.method === 'attendance' || emp.method === 'daily') totalDeductionMin = s.totalMin;
  else if (emp.method === 'monthlyDeduct') {
    const required = (s.workDays - leave.missingStamps) * shiftMin;
    const actual = s.totalMin - s.breakExcessMin - s.prayerPenaltyMin;
    totalDeductionMin = required > actual ? required - actual : 0;
  }

  const courier = COURIER.includes(emp.role);
  const expat = EXPAT.includes(emp.expatStatus ?? '');
  const mealDays = manual.mealDays;
  let mealAmount                    ;
  if (mealDays !== undefined) {
    if (expat && emp.role === 'مشرف خدمة توصيل') mealAmount = rates.mealDeliverySupervisor * mealDays;
    else if (courier) mealAmount = rates.mealCourier * mealDays;
    else if (expat) mealAmount = rates.mealExpat * mealDays;
  }

  const supervisionTrips = manual.supervisionTrips ?? 0;
  const supervisionAmount = supervisionTrips * rates.supervisionPerTrip;
  const permissionPenaltyMin = only(s.permissionPenaltyMin);
  const latePenaltyMin = only(s.latePenaltyMin);
  const leaveDaysForCourier =
    leave.used.casual + leave.used.annual + leave.used.sick + leave.absentNoPermission + leave.absentNoNotice + leave.paidDays + leave.specialDays;
  const overtimeMin = manual.overtimeMin ?? 0;

  return {
    code: emp.code,
    month: MONTH_NAMES[month - 1],
    branch: emp.branch,
    name: emp.name,
    incentive: emp.incentiveOnResignation,
    role: emp.role,
    gender: emp.gender,
    hireDate: emp.hireDate,
    transferDate: emp.transferDate,
    resignationDate: emp.resignationDate,
    expatStatus: emp.expatStatus,
    status: STATUS_LABEL[leave.status],
    statusChangeDeductMin: leave.status === 'transferredNew' ? 0 : manual.statusChange?.deductMin ?? 0,
    statusChangeNightDeductMin: manual.statusChange?.nightDeductMin ?? 0,
    breakExcessMin: only(s.breakExcessMin),
    earlyLeaveMin: only(s.earlyLeaveMin),
    sickPermissionMin: only(s.sickPermissionMin),
    permissionMin: only(s.permissionMin),
    permissionPenaltyMin,
    lateMin: only(s.lateMin),
    latePenaltyMin,
    prayerExcessMin: only(s.prayerExcessMin),
    prayerPenaltyMin: only(s.prayerPenaltyMin),
    totalDeductionMin,
    // الجزاءات = اللي الـ HR دخّلها + الختم اليدوي (اللي البرنامج لقاه لوحده من البصمات + اللي اتدخّل بالإيد)
    penaltiesMin: (manual.penaltiesMin ?? 0) + (s.missedPunches + (manual.manualStampPenalties ?? 0)) * rates.manualStampPenaltyMin,
    missedPunches: s.missedPunches,
    overtimeMin,
    overtimeTotalMin: overtimeMin * rates.overtimeMultiplier,
    statusChangeOvertimeMin: manual.statusChange?.overtimeMin ?? 0,
    statusChangeNightOvertimeMin: manual.statusChange?.nightOvertimeMin ?? 0,
    casual: leave.used.casual,
    annual: leave.used.annual,
    sick: leave.used.sick,
    absentNoPermission: leave.absentNoPermission,
    absentNoNotice: leave.absentNoNotice,
    missingStamps: leave.missingStamps,
    unpaid: leave.unpaidDays,
    paid: leave.paidDays,
    hireResignDays: leave.hireResignDays,
    weeklyOffDeducted: emp.weeklyOffDeducted,
    reservedSalary: emp.reservedSalary,
    otherNotes: manual.otherNotes,
    notes: manual.notes,
    mealDays,
    mealAmount,
    shiftFrom: emp.shift.startMin,
    shiftTo: emp.shift.endMin,
    shiftHours: shiftMin / 60,
    nightHours: emp.nightHours ?? 0,
    workDays: s.workDays,
    supervisionTrips,
    supervisionAmount,
    deliveryTrips: manual.deliveryTrips ?? 0,
    deliveryTripsAmount: manual.deliveryTripsAmount ?? 0,
    tripsTotal: supervisionTrips + (manual.deliveryTrips ?? 0),
    tripsTotalAmount: (manual.deliveryTripsAmount ?? 0) + supervisionAmount + rates.tarshoubyPlus * (manual.tarshoubyPlusDays ?? 0),
    tarshoubyPlusDays: manual.tarshoubyPlusDays,
    nursingAmount: manual.nursingAmount ?? 0,
    basicDeductionMin: courier ? permissionPenaltyMin + latePenaltyMin : totalDeductionMin,
    specialLeave: leave.specialDays,
    // مندوب الفسبا: كل يوم إجازة بيتخصم بعدد ساعات شيفته
    courierDeductionMin: courier ? permissionPenaltyMin + leaveDaysForCourier * shiftMin : 0,
    accruedAtResignation: leave.accruedAtResignation,
    leaveDeduction: leave.deduction.total,
    weeklyOff: emp.weeklyOff,
    tenure: TENURE_LABEL[leave.tenure],
    balanceCasual: leave.balance.casual,
    balanceAnnual: leave.balance.annual,
    balanceSick: leave.balance.sick,
    monthlyRequiredMin: monthly?.requiredMin,
    monthlyActualMin: monthly?.actualMin,
  };
}

/** أيام العمل اللي ساعات الشهر بتتقسم عليها (30 يوم − 4 إجازات أسبوعية) */
export const MONTHLY_HOURS_WORK_DAYS = 26;

/**
 * المحاسبة بساعات الشهر (المدير): المطلوب = ساعات الشهر بنسبة الأيام اللي كان فيها في الفرع،
 * ناقص نصيب كل يوم إجازة (ساعات الشهر ÷ 26)، عشان الإجازة ليها خصمها لوحدها ومايتخصمش مرتين.
 * الفعلي = ساعات الشغل الصافية (من غير زيادة الصلاة والراحة)، ويوم المأمورية من غير انصراف بيتحسب يوم كامل.
 * الخصم = الناقص بس، والزيادة مابتتحسبش إضافي.
 */
export function monthlyHoursCheck(emp                , days             , leave                  ) {
  if (!emp.monthlyHours) return undefined;
  const targetMin = emp.monthlyHours * 60;
  const perDay = targetMin / MONTHLY_HOURS_WORK_DAYS;
  const periodDays = emp.periodDays ?? days.length;
  const employedDays = Math.max(0, days.length - leave.hireResignDays);
  const leaveDays = days.filter((d) => d.leave).length;
  const requiredMin = Math.max(0, Math.round(targetMin * Math.min(1, employedDays / periodDays) - leaveDays * perDay));
  let actualMin = 0;
  for (const d of days) {
    if (d.leave) continue;
    if (d.workedMin > 0) actualMin += d.workedMin - d.prayerPenaltyMin - d.breakExcessMin;
    else if (d.isWorkDay) actualMin += perDay;
  }
  return { requiredMin, actualMin: Math.round(actualMin) };
}

// ---------- التصدير ----------

const hm = (min        ) => {
  const sign = min < 0 ? '-' : '';
  const m = Math.round(Math.abs(min));
  return `${sign}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
const clock = (min        ) => hm(((min % 1440) + 1440) % 1440);

export function formatCell(value         , kind      )         {
  if (value === undefined || value === null || value === '') return '';
  if (kind === 'minutes') return hm(Number(value));
  if (kind === 'clock') return clock(Number(value));
  if (kind === 'number' || kind === 'money') return String(Math.round(Number(value) * 100) / 100);
  return String(value);
}

/** CSV بترميز UTF-8 مع BOM عشان Excel يفتحه بالعربي صح. الأوقات بتطلع ساعات:دقايق */
export function toCsv(rows                )         {
  const esc = (s        ) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [REPORT_COLUMNS.map(([, label]) => esc(label)).join(',')];
  for (const r of rows) lines.push(REPORT_COLUMNS.map(([key, , kind]) => esc(formatCell(r[key], kind))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
