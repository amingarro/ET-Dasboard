import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import {
  faAtlassian,
  faBitbucket,
  faGithub,
  faGoogle,
  faSlack,
  faTrello,
} from "@fortawesome/free-brands-svg-icons";
import type { ViewGroup } from "@/types/electron-api";

// Pantheon has no Font Awesome brand mark, so its real logo mark is defined
// here by hand in the same shape Font Awesome generates its own icons in —
// FontAwesomeIcon renders any object of this shape, brand pack or not.
const faPantheon = {
  prefix: "fak",
  iconName: "pantheon",
  icon: [
    24,
    24,
    [],
    "",
    "M7.258 0l2.205 5.171H6.656l.929 2.276h5.689L7.258-.001zm-.169 7.973c-.315 0-.487 0-.629.456C6.289 8.974 6.27 10 6.27 12s.02 3.027.19 3.571c.142.456.314.456.629.456h3.585l-1.775-4.203h1.589l-.891-2.1h.427l.892 2.101h1.894l-1.637-3.853H7.09zm3.398 3.851l.001.002.003-.002h-.003zm1.089-3.851l.743 1.752h3.175c.069 0 .23-.085.23-.877s-.16-.876-.23-.876h-3.919zm.892 2.1l.743 1.752h2.632c.07 0 .23-.085.23-.877s-.16-.876-.23-.876h-3.376zM9.47 12.175l1.858 4.377H8.021l6.115 7.449-2.205-5.172h2.806l-.939-2.276h-1.302l-1.86-4.377H9.469zm1.594 0l.743 1.752h4.038c.07 0 .23-.085.23-.876s-.161-.877-.231-.877h-4.78zm.89 2.101l.745 1.751h2.797c.069 0 .23-.085.23-.876s-.163-.876-.231-.876h-3.54zm5.046.509a.718.718 0 0 0-.286.06l.005-.002a.744.744 0 0 0-.386.383l-.002.005a.682.682 0 0 0-.058.279v.007c0 .101.021.197.06.284l-.002-.004a.744.744 0 0 0 .383.386l.005.002a.71.71 0 0 0 .571-.002l-.005.002a.744.744 0 0 0 .386-.383l.002-.005a.71.71 0 0 0-.002-.571l.002.005a.744.744 0 0 0-.383-.386l-.005-.002a.705.705 0 0 0-.283-.058H17zm.002.129c.084 0 .164.017.237.049l-.004-.002a.608.608 0 0 1 .318.315l.002.004a.587.587 0 0 1-.002.47l.002-.004a.605.605 0 0 1-.315.318l-.004.002a.587.587 0 0 1-.47-.002l.004.002a.605.605 0 0 1-.318-.315l-.002-.004a.573.573 0 0 1-.047-.23v-.004h.001v-.005c0-.082.017-.16.048-.231l-.001.004a.605.605 0 0 1 .315-.318l.004-.001a.587.587 0 0 1 .233-.047h.001zm.073.178h-.006l-.027.001h.001-.321l-.001.001v.832h.153v-.341h.112l.207.341h.16l-.215-.353a.234.234 0 0 0 .142-.065.222.222 0 0 0 .057-.148l-.001-.018V15.328a.241.241 0 0 0-.072-.171.325.325 0 0 0-.189-.066zm-.201.136h.183a.199.199 0 0 1 .065.014h-.001c.019.008.034.02.046.035a.126.126 0 0 1 0 .129v-.001a.12.12 0 0 1-.045.035h-.001a.187.187 0 0 1-.063.014h-.184v-.227z",
  ],
} as unknown as IconDefinition;

export interface ServiceDefinition {
  id: string;
  name: string;
  url: string;
  partition: string;
  icon: IconDefinition;
  color: string;
  // CSS `background` value overriding the flat `color` badge background —
  // for brand marks made of multiple colors (e.g. Slack's four-color logo).
  iconBackground?: string;
  // Overrides the glyph's own color, for brand marks whose readable
  // combination isn't "white on `color`" or the near-black auto-invert
  // (e.g. Pantheon: yellow badge with a black glyph, both explicit).
  iconColor?: string;
}

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    id: "gmail",
    name: "Gmail",
    url: "https://mail.google.com/mail/u/0/",
    partition: "persist:gmail",
    icon: faGoogle,
    color: "#ea4335",
  },
  {
    id: "github",
    name: "GitHub",
    url: "https://github.com",
    partition: "persist:github",
    icon: faGithub,
    color: "#181717",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    url: "https://bitbucket.org",
    partition: "persist:bitbucket",
    icon: faBitbucket,
    color: "#0052cc",
  },
  {
    id: "trello",
    name: "Trello",
    url: "https://trello.com/u/amingarro/boards",
    partition: "persist:trello",
    icon: faTrello,
    color: "#0079bf",
  },
  {
    id: "harvest",
    name: "Harvest",
    url: "https://kurobits.harvestapp.com/time",
    partition: "persist:harvest",
    // Harvest has no Font Awesome brand mark — fall back to a generic
    // time-tracking glyph in the product's own brand color.
    icon: faClock,
    color: "#fa5b0f",
  },
  {
    id: "atlassian",
    name: "Jira",
    url: "https://start.atlassian.com/",
    partition: "persist:atlassian",
    icon: faAtlassian,
    color: "#2684ff",
  },
  {
    id: "slack",
    name: "Slack",
    url: "https://app.slack.com/client",
    partition: "persist:slack",
    icon: faSlack,
    color: "#4a154b",
    // Matches the real logo's quadrant layout: blue top-left, green
    // top-right, yellow bottom-right, red/pink bottom-left. `from 0deg`
    // starts the sweep pointing up, going clockwise.
    iconBackground:
      "conic-gradient(from 0deg, #2eb67d 0deg 90deg, #ecb22e 90deg 180deg, #e01e5a 180deg 270deg, #36c5f0 270deg 360deg)",
  },
  {
    id: "pantheon",
    name: "Pantheon",
    url: "https://dashboard.pantheon.io/workspace",
    partition: "persist:pantheon",
    icon: faPantheon,
    // Real brand yellow badge with the logo mark in black, both explicit
    // (see ServiceDefinition.iconColor) rather than relying on the
    // near-black auto-invert, which doesn't fire for a light color like this.
    color: "#FCDC49",
    iconColor: "#000000",
  },
];

export function getServiceDefinition(id: string): ServiceDefinition | undefined {
  return SERVICE_DEFINITIONS.find((service) => service.id === id);
}

// Renderer-side mirror of the same-named helper in electron/store.ts (main
// process) — kept duplicated rather than shared, same reasoning as
// StoreSchema in types/electron-api.d.ts: main/renderer are separate TS
// build targets.
export function soloGroup(serviceId: string): ViewGroup {
  return { id: serviceId, serviceIds: [serviceId], splitDirection: "horizontal", splitSizes: {} };
}
