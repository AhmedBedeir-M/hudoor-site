// سياسة الحضور والانصراف. كل الأرقام بالدقايق.
// القيم الافتراضية مستخرجة من شيت الفرع (docs/attendance-logic-spec.md)
// وكلها قابلة للتعديل من غير ما نلمس اللوجيك.

                                   
                                
                       
                                               
                      
                                      
                          
                                                                                        
                           
                            
                             
                                          
                               
                                            
                                   
                               
                             
                                 
                    
                            
                                
                                                                        
                                
 

export const DEFAULT_POLICY                   = {
  lateGraceMin: 10,
  handoverMin: 15,
  handoverRoles: ['كاشير', 'صيدلى', 'صيدلي', 'بيع', 'كول سنتر'],
  lateThresholdMin: 50,
  lateMultiplierLow: 2,
  lateMultiplierHigh: 4,
  earlyLeaveMultiplier: 2,
  sickEarlyLeaveMultiplier: 1,
  prayerAllowanceMin: 15,
  prayerExcessMultiplier: 2,
  breakAllowanceMin: 30,
  breakExcessMultiplier: 2,
  payrollPeriodStartDay: 21,
};

export function requiresHandover(role        , policy                   = DEFAULT_POLICY)          {
  return policy.handoverRoles.some((r) => role.includes(r));
}
