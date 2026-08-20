'use strict';

function isSuccessfulHttpStatus(status){
  return Number.isInteger(status) && status>=200 && status<300;
}

function taskCompletionIsVerified(task){
  return String(task?.status||'')==='Completed'
    && Boolean(task?.completed_at)
    && Boolean(task?.completed_by);
}

module.exports={isSuccessfulHttpStatus,taskCompletionIsVerified};
