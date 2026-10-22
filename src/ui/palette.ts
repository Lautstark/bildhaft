/**
 * The eight hues a group can be, each in two strengths: `frame` strong enough
 * to be a line, `fill` pale enough for a white card to stay a white card on
 * it, and for the toner. Frame and fill are picked apart — a yellow frame on
 * a blue ground is allowed — but the hues are the same eight in both rows,
 * so that the two rows read as one palette.
 *
 * The same eight colour a material in Bearbeiten: the strong row its title
 * and its frames, the pale row the ground of its cards and of its page — so
 * a Tafel's groups and the material around them come out of one box.
 */
export const ZONE_COLOURS: { frame: string; fill: string; name: string }[] = [
  { frame: '#f0b323', fill: '#fff1b3', name: 'ui.zone_yellow' },
  { frame: '#4caf50', fill: '#d8f2d2', name: 'ui.zone_green' },
  { frame: '#3f88e0', fill: '#d8e9fc', name: 'ui.zone_blue' },
  { frame: '#e35d8f', fill: '#fddfe9', name: 'ui.zone_pink' },
  { frame: '#f0862b', fill: '#ffe3c9', name: 'ui.zone_orange' },
  { frame: '#9366d6', fill: '#eadffb', name: 'ui.zone_purple' },
  { frame: '#23ada0', fill: '#d3f2ee', name: 'ui.zone_teal' },
  { frame: '#dd4a44', fill: '#fbdad8', name: 'ui.zone_red' },
];
