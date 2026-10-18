/**
 * F-153 / F-154: the bundled help documents, copied unchanged from MacDown
 * 0.7.3 (`Resources/help.md`, `Resources/contribute.md`, MIT). Opened as
 * normal editable documents named like the original's temporary copies.
 */
import helpMd from './assets/help.md?raw';
import contributeMd from './assets/contribute.md?raw';

export interface BundledDocument {
  name: string;
  text: string;
}

export const HELP_DOCUMENT: BundledDocument = { name: 'help.md', text: helpMd };
export const CONTRIBUTE_DOCUMENT: BundledDocument = { name: 'contribute.md', text: contributeMd };
