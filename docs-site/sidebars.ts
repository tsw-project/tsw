import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    'quickstart',
    {
      type: 'category',
      label: 'Usage',
      collapsed: false,
      items: ['globals', 'msw-class'],
    },
    'cli',
  ],
};

export default sidebars;
