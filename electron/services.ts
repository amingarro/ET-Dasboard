export interface ServiceDefinition {
  id: string;
  name: string;
  url: string;
  partition: string;
  headerStripDomains: string[];
}

export const defaultServices: ServiceDefinition[] = [
  {
    id: "gmail",
    name: "Gmail",
    url: "https://mail.google.com/mail/u/0/",
    partition: "persist:gmail",
    headerStripDomains: ["mail.google.com", "accounts.google.com"],
  },
  {
    id: "github",
    name: "GitHub",
    url: "https://github.com",
    partition: "persist:github",
    headerStripDomains: ["github.com"],
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    url: "https://bitbucket.org",
    partition: "persist:bitbucket",
    headerStripDomains: ["bitbucket.org", "id.atlassian.com"],
  },
  {
    id: "trello",
    name: "Trello",
    url: "https://trello.com/u/amingarro/boards",
    partition: "persist:trello",
    headerStripDomains: ["trello.com", "id.atlassian.com"],
  },
  {
    id: "harvest",
    name: "Harvest",
    url: "https://kurobits.harvestapp.com/time",
    partition: "persist:harvest",
    headerStripDomains: ["kurobits.harvestapp.com", "id.getharvest.com"],
  },
  {
    id: "atlassian",
    name: "Jira",
    url: "https://start.atlassian.com/",
    partition: "persist:atlassian",
    headerStripDomains: ["atlassian.com", "atlassian.net", "id.atlassian.com"],
  },
  {
    id: "slack",
    name: "Slack",
    url: "https://app.slack.com/client",
    partition: "persist:slack",
    headerStripDomains: ["slack.com", "app.slack.com"],
  },
  {
    id: "pantheon",
    name: "Pantheon",
    url: "https://dashboard.pantheon.io/workspace",
    partition: "persist:pantheon",
    headerStripDomains: ["dashboard.pantheon.io", "pantheon.io"],
  },
];
