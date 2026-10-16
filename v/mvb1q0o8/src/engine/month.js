import { DEFAULT_POLICY,                       } from './policy.js';
import { LEAVE_TYPES,                                } from './types.js';

const iso = (d      ) => d.toISOString().slice(0, 10);

/** الشهر الحسابي: من يوم 21 في الشهر اللي فات لحد يوم 20 في الشهر ده */
export function payrollPeriod(
  year        ,
  month        ,
  policy                   = DEFAULT_POLICY,
)                                               {
  const start = new Date(Date.UTC(year, month - 2, policy.payrollPeriodStartDay));
  const end = new Date(Date.UTC(year, month - 1, policy.payrollPeriodStartDay - 1));
  const days           = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) days.push(iso(d));
  return { from: iso(start), to: iso(end), days };
}

                               
                  
                         
                        
                        
                            
                               
                          
                           
                         
                          
                   
                   
                                    
 

export function summarizeMonth(days             )               {
  const leaves = Object.fromEntries(LEAVE_TYPES.map((t) => [t, 0]))                             ;
  const s               = {
    lateMin: 0, latePenaltyMin: 0, earlyLeaveMin: 0, permissionMin: 0, sickPermissionMin: 0, permissionPenaltyMin: 0,
    prayerExcessMin: 0, prayerPenaltyMin: 0, breakExcessMin: 0, breakPenaltyMin: 0,
    totalMin: 0, workDays: 0, leaves,
  };
  for (const d of days) {
    s.lateMin += d.lateMin;
    s.latePenaltyMin += d.latePenaltyMin;
    s.earlyLeaveMin += d.earlyLeaveMin;
    s.permissionMin += d.permissionMin;
    s.sickPermissionMin += d.sickPermissionMin;
    s.permissionPenaltyMin += d.permissionPenaltyMin;
    s.prayerExcessMin += d.prayerExcessMin;
    s.prayerPenaltyMin += d.prayerPenaltyMin;
    s.breakExcessMin += d.breakExcessMin;
    s.breakPenaltyMin += d.breakPenaltyMin;
    s.totalMin += d.totalMin;
    if (d.isWorkDay) s.workDays++;
    if (d.leave) leaves[d.leave]++;
  }
  // الإجازة بدون مرتب والمدفوعة الأجر بحد أقصى 30 يوم في الشهر
  leaves.unpaid = Math.min(30, leaves.unpaid);
  leaves.paid = Math.min(30, leaves.paid);
  return s;
}
