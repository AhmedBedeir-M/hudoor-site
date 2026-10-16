// قرارات مدير الفرع على "الخروج الغريب"، وتحويل يوم سوفتك ليوم جاهز للمحرك.
//
// الخروج الغريب يا استئذان يا مأمورية، واللي بيحدد هو إيميل مدير الفرع:
//   استئذان        ← بيتخصم ×2
//   استئذان مرضي   ← بيتخصم ×1
//   مأمورية عمل    ← مالهاش خصم
// لو مفيش قرار، الخروج بيتحسب استئذان (بيتخصم) وبيتعلّم "مستني قرار"، عشان الـ HR يراجعه قبل قفل الشهر.
                                                              
                                                         
                                                            

                                                                   

export const EXIT_KIND_LABEL                           = {
  permission: 'استئذان',
  sickPermission: 'استئذان مرضي',
  mission: 'مأمورية',
};

                               
                               
               
                                                                                                        
                 
                 
                                    
                      
                                          
                     
 

                                                     
                 
                                                          
                   
                          
 

/** أقصى فرق بين الوقت المكتوب في الإيميل ووقت الخروج في سوفتك */
export const EXIT_MATCH_TOLERANCE_MIN = 60;

export function resolveExits(exits                 , decisions                )                 {
  const assigned = new Map                      ();
  // القرارات اللي فيها وقت: كل قرار بياخد أقرب خروج ليه
  for (const d of decisions.filter((x) => x.atMin !== undefined)) {
    let best = -1;
    for (let i = 0; i < exits.length; i++) {
      if (assigned.has(i)) continue;
      const diff = Math.abs(exits[i].outMin - d.atMin );
      if (diff <= EXIT_MATCH_TOLERANCE_MIN && (best < 0 || diff < Math.abs(exits[best].outMin - d.atMin ))) best = i;
    }
    if (best >= 0) assigned.set(best, d);
  }
  // القرار اللي من غير وقت بيتطبق على الباقي
  const dayWide = decisions.find((x) => x.atMin === undefined);
  return exits.map((e, i) => {
    const decision = assigned.get(i) ?? dayWide;
    return { ...e, kind: decision?.kind ?? 'permission', pending: !decision, decision };
  });
}

/**
 * بيحوّل يوم سوفتك + جدول الموظف + قرارات المدير ليوم جاهز للمحرك.
 * - خروج في نص الشيفت ورجع: الاستئذان بيتضاف لدقايق الاستئذان، والمأمورية مالهاش خصم.
 * - خروج قبل آخر الشيفت ومارجعش: المحرك بيحسبه انصراف مبكر ×2. المرضي بيتخصم ×1، والمأمورية مالهاش خصم.
 */
export function toDayInput(
  punch          ,
  schedule             ,
  decisions                 = [],
  leave            ,
)                                             {
  const exits = resolveExits(punch.exits, decisions.filter((d) => d.date === punch.date));
  const input           = {
    date: punch.date,
    isWeeklyOff: schedule.isWeeklyOff,
    officialIn: schedule.officialIn,
    officialOut: schedule.officialOut,
    actualIn: punch.actualIn,
    actualOut: punch.actualOut,
    prayerMin: punch.prayerMin,
    breakMin: punch.breakMin,
    permissionMin: 0,
    sickPermissionMin: 0,
    leave,
  };
  for (const e of exits) {
    const midShift = e.backMin !== undefined;
    if (e.kind === 'mission') {
      if (!midShift) input.mission = true;
    } else if (e.kind === 'sickPermission') {
      if (midShift) input.sickPermissionMin  += e.minutes;
      else input.earlyLeaveIsSick = true;
    } else if (midShift) {
      input.permissionMin  += e.minutes;
    }
  }
  return { input, exits };
}
