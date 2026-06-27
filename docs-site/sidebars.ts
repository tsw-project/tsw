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
    {
      type: 'category',
      label: 'Technical',
      collapsed: false,
      items: ['type-declarations', 'transpilation', 'patches', 'scope'],
    },
    'cli',
  ],
};

export default sidebars;
