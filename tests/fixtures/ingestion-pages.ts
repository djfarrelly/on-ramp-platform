// Structural HTML fixtures, not directory seed data or copied publisher prose.
// Reflect the inspected page structures; unrelated content must never become facts.
export const ingestionPages = {
  'wcc-programs': `<html><body>
    <nav><p>Unrelated navigation</p></nav>
    <h1 id="header-page-title">Business Bootcamp</h1>
    <main id="main-content">
      <p>Develop a business idea with coaching and classroom learning.</p>
      <p>A hybrid format of online and in-person evening sessions.</p>
      <p>Spend 10+ hours per month over five months.</p>
      <ul><li>Test a business model.</li></ul>
      <p>Programs are free for current WCC students and county residents; others pay a one-time $25 fee.</p>
      <p>Participants must be 18 years or older; additional restrictions apply.</p>
    </main><footer><p>Unrelated footer</p></footer>
  </body></html>`,
  'innovate-marquette-programs': `<html><body>
    <header data-elementor-type="header"><p>Unrelated navigation</p></header>
    <h1 class="elementor-heading-title">Product Prototyping</h1>
    <div data-elementor-type="wp-page">
      <div class="elementor-widget-text-editor"><p>Explore product prototypes with local specialists.</p></div>
      <div class="elementor-widget-posts"><article><p>Unrelated news</p></article></div>
    </div>
    <footer data-elementor-type="footer"><div class="elementor-widget-text-editor"><p>Unrelated footer</p></div></footer>
  </body></html>`,
  'michigan-sbdc-programs': `<html><body><nav><p>Unrelated navigation</p></nav>
    <main><div class="wbp_wrapper"><h1>Business Growth Services</h1>
      <h2>Receive No-Cost Assistance</h2>
      <p>For established companies meeting at least 2 stated growth criteria.</p>
    </div>
    <div class="wbp_wrapper"><ul><li>Financial benchmarking and planning.</li></ul></div>
    <article><p>Unrelated news</p></article>
    <div class="wbp_wrapper"><p>Unrelated testimonial</p></div>
    </main><footer><p>Unrelated footer</p></footer>
  </body></html>`,
  'techtown-programs': `<html><body>
    <section><div class="bde-text">Unrelated navigation</div></section>
    <section class="bde-section-4975-196">
      <h1>Retail Boot Camp</h1><h1>A secondary headline</h1>
      <div class="bde-text">Business training for local retailers.</div>
    </section>
    <section><div class="bde-text">Unrelated related programs</div></section>
    <footer><div class="bde-text">Unrelated footer</div></footer>
  </body></html>`,
} as const

export const camwEventPage = `<html><body><main id="main">
  <h1 class="title">events</h1>
  <div class="event-item"><div class="info">
    <h1>Career Planning Workshop</h1>
    <p><span class="date-display-single" content="2026-11-20T13:00:00-05:00">Friday afternoon</span></p>
    <p><strong>Lansing American Job Center</strong></p>
    <p>Develop a practical job search and career plan.</p>
  </div><div class="map"><p>Unrelated map</p></div></div>
  <aside><p>Unrelated sidebar</p></aside>
</main></body></html>`
