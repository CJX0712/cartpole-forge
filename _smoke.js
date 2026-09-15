/* 无头验证：cartpole-forge 引擎 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
const ctx={console,Math,TextEncoder,TextDecoder,Uint8Array,Int32Array,Int8Array,Float64Array,Object,Array,JSON,isFinite,Infinity,globalThis:{}};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(m[1],ctx,{filename:'engine.js'});
const RL=ctx.RL;

let pass=0,fail=0,fails=[];
function ok(name,cond,detail){
  if(cond){pass++;}
  else{fail++;fails.push(name+(detail?' :: '+detail:''));}
}

/* 1. 物理确定性 + 终止条件 */
const rng=DIFFmul();
function DIFFmul(){return RL.mulberry32(1);}
const s0=[0.1,-0.2,0.05,0.1];
const a1=RL.step(s0,1),a2=RL.step(s0,1);
let phEq=a1.state.every((v,i)=>v===a2.state[i])&&a1.done===a2.done;
ok('physics deterministic',phEq);
ok('terminal on |x|>2.4',RL.step([2.5,0,0,0],0).done===true);
ok('terminal on |θ|>12°',RL.step([0,0,0.25,0],0).done===true);
ok('reward=1 per step',RL.step([0,0,0,0],0).reward===1);
/* 恒定力必终结：杆无法被常力永久平衡（物理不稳定性） */
let fell=false;
for(let i=0;i<2;i++){
  let st=[0.01*(i?1:-0.5),0,0.02,0],done=false;
  for(let t=0;t<500;t++){const r2=RL.step(st,i);st=r2.state;if(r2.done){done=true;break;}}
  if(!done)fell=false;else fell=true;
}
ok('constant force eventually terminates',fell);

/* 2. reset 边界 */
const rs=RL.reset(RL.mulberry32(7));
ok('reset within ±0.05',rs.every(x=>Math.abs(x)<=0.05));

/* 3. GAE：递推 vs 暴力展开（多次随机对拍） */
let gaeOk=true,worst=0;
for(let trial=0;trial<20;trial++){
  const r2=RL.mulberry32(100+trial),T=5+Math.floor(r2()*30);
  const rewards=[],values=[],dones=[];
  for(let t=0;t<T;t++){rewards.push(r2());values.push((r2()-0.5)*4);dones.push(r2()<0.1);}
  const nextV=dones[T-1]?0:r2();
  const g1=RL.gae(rewards,values,dones,0.99,0.95,nextV);
  const g2=RL.gaeBrute(rewards,values,dones,0.99,0.95,nextV);
  for(let t=0;t<T;t++){
    const e=Math.abs(g1[t]-g2[t]);
    worst=Math.max(worst,e);
    if(!(e<1e-10))gaeOk=false;
  }
}
ok('GAE recursion == brute force',gaeOk,'worst='+worst.toExponential(2));

/* 4. 梯度检验（PPO 裁剪目标 + 价值 + 熵） */
const gc=RL.gradCheck(5,1e-6);
ok('gradCheck',gc<1e-5,'maxRel='+gc);

/* 5. 训练确定性（短程 bit 级） */
const t1=RL.train({iters:3,seed:7,rolloutSteps:300,maxSteps:100});
const t2=RL.train({iters:3,seed:7,rolloutSteps:300,maxSteps:100});
let dmax=0;
for(let l=0;l<t1.policy.W.length;l++)for(let i=0;i<t1.policy.W[l].length;i++)
  dmax=Math.max(dmax,Math.abs(t1.policy.W[l][i]-t2.policy.W[l][i]));
for(l=0;l<t1.value.W.length;l++)for(i=0;i<t1.value.W[l].length;i++)
  dmax=Math.max(dmax,Math.abs(t1.value.W[l][i]-t2.value.W[l][i]));
ok('train determinism',dmax===0,'maxdiff='+dmax);

/* 6. 随机基线 */
const base=RL.train({iters:0,seed:99,rolloutSteps:300,maxSteps:200,evalEpisodes:10});
ok('random baseline low',base.evalAvg<100,'random='+base.evalAvg.toFixed(1));

/* 7. 主训练：学会平衡（核心不变量） */
const model=RL.train({iters:200,seed:42,rolloutSteps:800,maxSteps:200,lr:0.008,hidden:16,evalEpisodes:10});
ok('trained agent balances',model.evalAvg>150,'evalAvg='+model.evalAvg.toFixed(1)+' evals='+JSON.stringify(model.evals));
ok('trained >> random',model.evalAvg>1.8*base.evalAvg,
  model.evalAvg.toFixed(1)+' vs '+(1.8*base.evalAvg).toFixed(1));
const h=model.hist.map(x=>x.ret);
const first10=h.slice(0,10).reduce((a,b)=>a+b,0)/10;
const last10=h.slice(-10).reduce((a,b)=>a+b,0)/10;
ok('returns improve',last10>2*first10,'first10='+first10.toFixed(1)+' last10='+last10.toFixed(1));

/* 8. 训练量有限性 */
ok('hist finite',h.every(x=>isFinite(x)&&x>0));

/* 9. 边界：maxSteps 封顶 */
const cap=RL.runEpisode(t1.policy,RL.mulberry32(3),5,false);
ok('episode capped by maxSteps',cap.steps<=5,'steps='+cap.steps);

/* 10. 贪心动作输出结构 */
const g=RL.greedyAction(model.policy,[0,0,0,0]);
ok('greedy probs valid',Math.abs(g.probs[0]+g.probs[1]-1)<1e-12&&(g.a===0||g.a===1));

fs.writeFileSync(path.join(__dirname,'_smoke.log'),
  `PASS ${pass} / ${pass+fail}\n`+(fail?'FAIL '+fails.join(' | '):'ALL GREEN')+'\n');
console.log(fail?`FAIL ${fail}: `+fails.join(' | '):`ALL GREEN ${pass}/${pass+fail}`);
process.exit(fail?1:0);
