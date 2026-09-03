/* input.js : two-player keyboard handling
   P1 ARSHIA : W A S D  (+ Shift/E for lasso, Q kiss)
   P2 ROJINA : Arrows   (+ . or / for lantern-flare, ' kiss)          */

const Input = (()=>{
  const down=new Set(), pressed=new Set(), released=new Set();
  const raw=new Set();
  let anyKeyFlag=false, lastKey='';

  const MAPS={
    p1:{ left:'KeyA', right:'KeyD', up:'KeyW', down:'KeyS', act:'KeyE', act2:'ShiftLeft', kiss:'KeyQ' },
    p2:{ left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', act:'Slash', act2:'Period', kiss:'ShiftRight' }
  };

  const BLOCK=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Slash','Quote',
                       'KeyW','KeyA','KeyS','KeyD','Tab']);

  addEventListener('keydown',e=>{
    if(BLOCK.has(e.code))e.preventDefault();
    if(!raw.has(e.code)){pressed.add(e.code);anyKeyFlag=true;lastKey=e.code;}
    raw.add(e.code);down.add(e.code);
  });
  addEventListener('keyup',e=>{
    if(BLOCK.has(e.code))e.preventDefault();
    raw.delete(e.code);down.delete(e.code);released.add(e.code);
  });
  addEventListener('blur',()=>{raw.clear();down.clear();});

  return {
    MAPS,
    held:c=>down.has(c),
    hit :c=>pressed.has(c),
    up  :c=>released.has(c),
    /* per-player convenience */
    p(n,a){return down.has(MAPS['p'+n][a]);},
    ph(n,a){return pressed.has(MAPS['p'+n][a]);},
    pu(n,a){return released.has(MAPS['p'+n][a]);},
    axis(n){return (down.has(MAPS['p'+n].right)?1:0)-(down.has(MAPS['p'+n].left)?1:0);},
    anyKey(){return anyKeyFlag;},
    last(){return lastKey;},
    /* menu navigation: either player can drive the menus */
    menuUp  (){return pressed.has('KeyW')||pressed.has('ArrowUp');},
    menuDown(){return pressed.has('KeyS')||pressed.has('ArrowDown');},
    menuLeft(){return pressed.has('KeyA')||pressed.has('ArrowLeft');},
    menuRight(){return pressed.has('KeyD')||pressed.has('ArrowRight');},
    menuOk  (){return pressed.has('Enter')||pressed.has('Space')||pressed.has('KeyE')||pressed.has('Slash');},
    menuBack(){return pressed.has('Escape')||pressed.has('Backspace')||pressed.has('KeyQ');},
    endFrame(){pressed.clear();released.clear();anyKeyFlag=false;}
  };
})();
