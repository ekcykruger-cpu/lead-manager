(function (root, factory) {
  var o = factory();
  if (typeof module === 'object' && module.exports) module.exports = o; else root.Outcomes = o;
})(this, function () {
  var OUTCOMES = [
    {k:'interested', l:'Yes, interested', cat:'open'},
    {k:'thinking', l:'Thinking about it', cat:'open'},
    {k:'test_drive', l:'Wants a test drive', cat:'open'},
    {k:'info', l:'Send me more information', cat:'open'},
    {k:'cant_talk', l:"I can't talk now", cat:'open'},
    {k:'no_answer', l:'No answer or voicemail', cat:'open'},
    {k:'callback', l:'Call me at a specific time', cat:'open', schedule:true},
    {k:'not_interested', l:'Not interested', cat:'final'},
    {k:'dnc', l:'Do not call me again', cat:'final'},
    {k:'remove', l:'Take my name off the list', cat:'final'},
    {k:'bought', l:'Already bought another car', cat:'final'},
    {k:'wrong', l:'Wrong number', cat:'final'}
  ];
  var OC = {};
  OUTCOMES.forEach(function (o) { OC[o.k] = o; });
  return {OUTCOMES: OUTCOMES, OC: OC};
});
