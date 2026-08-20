/*
  Shared Operations rules.
  These small, dependency-free functions are used by the browser app and by the
  regression suite so a passing test exercises the same business rule.
*/
(function(root){
  'use strict';

  function norm(value){ return String(value || '').trim().toLowerCase(); }

  function machineryType(machinery){
    const saved=String(machinery?.machinery_type || '').trim();
    if(['Engine','Gearbox','Pump'].includes(saved)) return saved;
    const legacy=`${machinery?.equipment_type || ''} ${machinery?.name || ''}`.toLowerCase();
    if(legacy.includes('gear')) return 'Gearbox';
    if(legacy.includes('pump')) return 'Pump';
    return 'Engine';
  }

  function scheduleProcedureMatchesMachinery(procedure, machinery){
    if(/^pm planned\b/i.test(String(procedure?.name || '')) || /^planned:/i.test(String(procedure?.category || ''))) return true;
    const category=norm(procedure?.category);
    const type=machineryType(machinery);
    if(category==='engine') return type==='Engine';
    if(category==='pump') return type==='Pump';
    if(category==='gearbox') return type==='Gearbox';
    if(category==='hose reel') return /hose\s*reel/i.test(String(machinery?.equipment_type || machinery?.name || ''));
    if(category==='pressure system') return /pressure\s*system/i.test(String(machinery?.equipment_type || machinery?.name || ''));
    return category==='general' && /^water\s*blaster$/i.test(String(machinery?.equipment_type || '').trim());
  }

  function vehicleCheckDueSoonLeadDays(frequencyDays){
    const frequency=Math.max(1, Number(frequencyDays) || 14);
    return Math.min(7, frequency);
  }

  function vehicleCheckNeedsAttention(daysUntilDue, frequencyDays){
    return Number.isFinite(Number(daysUntilDue)) && Number(daysUntilDue)<=vehicleCheckDueSoonLeadDays(frequencyDays);
  }

  function itemIsProblem(item, answer){
    if(/(?:Record reading from TDS Meter|Measure pure water system)/i.test(String(item?.question_text || ''))){
      const reading=Number(answer);
      return Number.isFinite(reading) && reading>10;
    }
    const problemValues=Array.isArray(item?.problem_values) ? item.problem_values.map(String) : [];
    return problemValues.includes(String(answer)) || ['Issue to report','Fail','Yes'].includes(String(answer));
  }

  function issueAnswerRows(answerRows){ return (answerRows || []).filter(row=>row?.problem===true); }

  function taskIsOpen(task){ return !['Completed','Deferred'].includes(String(task?.status || '')); }

  const api=Object.freeze({
    machineryType,
    scheduleProcedureMatchesMachinery,
    vehicleCheckDueSoonLeadDays,
    vehicleCheckNeedsAttention,
    itemIsProblem,
    issueAnswerRows,
    taskIsOpen
  });
  if(root) root.SWOperationsRules=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof window!=='undefined' ? window : globalThis);
