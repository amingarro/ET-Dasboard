import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import {
  faAtlassian,
  faBitbucket,
  faGithub,
  faGoogle,
  faTrello,
} from "@fortawesome/free-brands-svg-icons";

export interface ServiceDefinition {
  id: string;
  name: string;
  url: string;
  partition: string;
  icon: IconDefinition;
  color: string;
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
];

export function getServiceDefinition(id: string): ServiceDefinition | undefined {
  return SERVICE_DEFINITIONS.find((service) => service.id === id);
}
