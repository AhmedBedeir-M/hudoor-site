import { DEFAULT_POLICY,                       } from './policy.js';

/** الأيام: 0 = الأحد … 6 = السبت */
                                                

                        
                          
                   
                                                    
                 
 

                                   
               
                            
                                   
                     
                                                                         
                    
 

/**
 * طلب تغيير حالة، بيبعته مشرف الفرع والـ HR بيعتمده.
 * الدائم بيغيّر الأساس من تاريخ معيّن، والمؤقت بيغطي فترة محددة وبعدها الموظف يرجع لأساسه.
 */
                                     
                                  
                   
               
                                            
              
                
                             
                    
 

                              
                       
                      
                       
                   
 

export function weekdayOf(date        )          {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()           ;
}

/** الشيفت والإجازة الأسبوعية الفعليين في يوم معيّن، بعد تطبيق طلبات تغيير الحالة المعتمدة */
export function shiftOn(
  date        ,
  base                  ,
  changes                       = [],
)                                              {
  const approved = changes.filter((c) => c.approved).sort((a, b) => a.from.localeCompare(b.from));

  let shift = base.shift;
  let weeklyOff = base.weeklyOff;
  for (const c of approved) {
    if (c.kind === 'permanent' && c.from <= date) {
      if (c.shift) shift = c.shift;
      if (c.weeklyOff !== undefined) weeklyOff = c.weeklyOff;
    }
  }
  for (const c of approved) {
    if (c.kind === 'temporary' && c.from <= date && (!c.to || date <= c.to)) {
      if (c.shift) shift = c.shift;
      if (c.weeklyOff !== undefined) weeklyOff = c.weeklyOff;
    }
  }
  return { shift, weeklyOff };
}

/** الجدول الفعلي لموظف في يوم معيّن، بعد تطبيق طلبات تغيير الحالة المعتمدة */
export function scheduleFor(
  date        ,
  base                  ,
  changes                       = [],
  policy                   = DEFAULT_POLICY,
)              {
  const { shift, weeklyOff } = shiftOn(date, base, changes);
  const shiftMin = shift.endMin - shift.startMin;
  if (weeklyOff !== null && weekdayOf(date) === weeklyOff) return { isWeeklyOff: true, shiftMin };
  return {
    isWeeklyOff: false,
    officialIn: shift.startMin + (base.lateGrace ? policy.lateGraceMin : 0),
    officialOut: shift.endMin + (base.handover ? policy.handoverMin : 0),
    shiftMin,
  };
}
