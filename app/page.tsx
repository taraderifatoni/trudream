'use client'

import Link from 'next/link'

const L = '#CDF22B'
const B = '#1E45FB'
const G = '#888888'
const W = '#e8e8ec'
const D = '#111118'
const S = '#1a1a26'

export default function LandingPage() {
  return (
    <div style={{ background: D, minHeight: '100vh', color: W, fontFamily: "'IBM Plex Mono','Courier New',monospace", position:'relative', zIndex:2 }}>
      <style>{`
        .pixel { font-family: 'Press Start 2P', monospace; letter-spacing:0; line-height:1.6; }
        .abtn { transition: transform .06s ease, box-shadow .06s ease, background .15s ease; }
        .abtn:hover { transform: translate(-1px,-2px); box-shadow: 4px 4px 0 rgba(205,242,43,0.5); }
        .abtn:active { transform: translate(2px,2px); box-shadow: 0px 0px 0 #000; }
      `}</style>

      {/* Header */}
      <header style={{ position:'sticky',top:0,zIndex:20,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',background:'rgba(13,13,20,0.92)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(255,255,255,0.06)',maxWidth:760,margin:'0 auto',paddingLeft:16,paddingRight:16 }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{width:6,height:6,background:L,display:'inline-block'}} />
          <span className="pixel" style={{fontSize:10,color:L}}>publisio</span>
          <span style={{fontSize:9,color:'#666666',marginLeft:6}}>TOKYO-01</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <span style={{fontSize:9,color:'#666666'}}>● ONLINE</span>
          <span className="pixel" style={{fontSize:7,color:B,border:`1px solid ${B}`,padding:'3px 7px'}}>v1.0</span>
          <Link href="/auth" className="pixel" style={{fontSize:7,color:L,textDecoration:'none',border:`1px solid ${L}`,padding:'3px 7px'}}>LOGIN</Link>
        </div>
      </header>

      <main style={{maxWidth:760,margin:'0 auto',padding:'0 16px'}}>
        {/* Hero */}
        <section style={{textAlign:'center',padding:'80px 0 40px'}}>
          <h1 className="pixel" style={{fontSize:30,color:W,textShadow:`3px 3px 0 #1E45FB`,lineHeight:1.5,margin:0}}>
            PUBLISIO
          </h1>
          <p style={{fontSize:13,color:G,marginTop:18,maxWidth:440,marginLeft:'auto',marginRight:'auto',lineHeight:1.6}}>
            AI-powered carousel generator for Instagram creators.<br/>Paste a link, get stunning slides instantly.
          </p>
          <div style={{display:'flex',gap:14,justifyContent:'center',marginTop:32,flexWrap:'wrap'}}>
            <Link href="/auth" className="pixel abtn" style={{background:L,color:'#111118',border:`2px solid ${L}`,borderRadius:12,padding:'14px 28px',fontSize:11,textDecoration:'none',boxShadow:'4px 4px 0 rgba(205,242,43,0.3)',display:'inline-block'}}>
              ▶ GET STARTED
            </Link>
            <Link href="/auth" className="pixel" style={{background:S,border:`1px solid rgba(255,255,255,0.1)`,borderRadius:12,padding:'14px 28px',fontSize:9,color:G,textDecoration:'none',display:'inline-block'}}>
              LOGIN
            </Link>
          </div>
          <div style={{marginTop:20}}>
            <span style={{fontSize:10,color:'#666666'}}>● No credit card required</span>
          </div>
        </section>

        {/* Feature cards */}
        <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,marginTop:20,paddingBottom:40}}>
          {[
            {tag:'01',title:'GENERATE',desc:'Turn any link or topic into a multi-slide carousel with AI visuals.'},
            {tag:'02',title:'ANALYZE',desc:'Gemini reads your content and creates structured slides automatically.'},
            {tag:'03',title:'POST',desc:'Download as ZIP or publish directly to Instagram with one click.'},
          ].map((c, i) => {
            const cardBg = '#1E45FB'
            const cardText = W
            const cardAccent = L
            return (
            <div key={c.tag} style={{background:cardBg,border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:22,display:'flex',flexDirection:'column',gap:12}}>
              <span className="pixel" style={{fontSize:20,color:cardAccent}}>{c.tag}</span>
              <h3 className="pixel" style={{fontSize:10,color:cardText,margin:0}}>{c.title}</h3>
              <p style={{fontSize:12,color:'rgba(255,255,255,0.75)',lineHeight:1.65,margin:0}}>{c.desc}</p>
            </div>
            )})}
        </section>

        {/* Footer */}
        <footer style={{borderTop:'1px solid rgba(255,255,255,0.06)',padding:'24px 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span className="pixel" style={{fontSize:8,color:'#666666'}}>publisio</span>
            <span style={{fontSize:8,color:'#666666'}}>•••</span>
            <span style={{fontSize:9,color:'#666666'}}>TOKYO-01</span>
          </div>
          <span style={{fontSize:8,color:'#666666'}}>© 2026</span>
        </footer>
      </main>
    </div>
  )
}
