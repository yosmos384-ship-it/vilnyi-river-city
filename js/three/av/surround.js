// VILNYI River City — apartment surround. A 5.1 mix (front L / C / R, surround L / R, LFE) built in Web Audio from a
// stereo source. On a 6-channel output the six channels go out as they are; on the usual stereo output they are folded
// down: centre and surrounds mixed in, the rear pair delayed and softened for room ambience, the LFE a low-passed sub send.
// Nothing is recorded: it only re-balances what the source plays.
export function createSurround(ac, out, six = false) {
  const inp = ac.createGain();
  const sp = ac.createChannelSplitter(2); inp.connect(sp);
  const mono = () => { const g = ac.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; return g; };
  const link = (src, dst, k = 1, srcOut = 0, dstIn = 0) => { const g = mono(); g.gain.value = k; src.connect(g, srcOut); g.connect(dst, 0, dstIn); return g; };
  const FL = mono(), FR = mono(), C = mono(), LFE = mono(), SL = mono(), SR = mono();
  FL.gain.value = 0.92; FR.gain.value = 0.92;
  sp.connect(FL, 0); sp.connect(FR, 1);
  // centre: the mid of both channels (dialogue-like weight), a little under the fronts
  sp.connect(C, 0); sp.connect(C, 1); C.gain.value = 0.42;
  // LFE: the mid, below 110 Hz
  sp.connect(LFE, 0); sp.connect(LFE, 1); LFE.gain.value = 0.55;
  const subLP = ac.createBiquadFilter(); subLP.type = 'lowpass'; subLP.frequency.value = 110; subLP.Q.value = 0.7;
  LFE.connect(subLP); const LFEo = mono(); LFEo.gain.value = 1.9; subLP.connect(LFEo);
  // rears: a short delay and a dark filter per side (room reflections, not an echo)
  const dL = ac.createDelay(0.1), dR = ac.createDelay(0.1), lpL = ac.createBiquadFilter(), lpR = ac.createBiquadFilter();
  dL.delayTime.value = 0.017; dR.delayTime.value = 0.023;
  for (const f of [lpL, lpR]) { f.type = 'lowpass'; f.frequency.value = 6500; f.Q.value = 0.5; }
  sp.connect(dL, 0); dL.connect(lpL); lpL.connect(SL); SL.gain.value = 0.5;
  sp.connect(dR, 1); dR.connect(lpR); lpR.connect(SR); SR.gain.value = 0.5;
  if (six) {
    const m = ac.createChannelMerger(6);
    FL.connect(m, 0, 0); FR.connect(m, 0, 1); C.connect(m, 0, 2); LFEo.connect(m, 0, 3); SL.connect(m, 0, 4); SR.connect(m, 0, 5);
    m.connect(out);
  } else {
    const sumL = mono(), sumR = mono(), m2 = ac.createChannelMerger(2);
    FL.connect(sumL); FR.connect(sumR);
    link(C, sumL, 0.707); link(C, sumR, 0.707);
    link(SL, sumL, 0.707); link(SR, sumR, 0.707);
    link(LFEo, sumL, 0.6); link(LFEo, sumR, 0.6);
    sumL.connect(m2, 0, 0); sumR.connect(m2, 0, 1);
    m2.connect(out);
  }
  return inp;
}
