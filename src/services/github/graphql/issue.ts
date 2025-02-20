export const Details = `
query Details($repo: String!, $owner: String!, $issueId: Int!) {
  repository(name: $repo, owner: $owner) {
    issue(number: $issueId) {
      id
    }
  }
}`;

export const Create = `
mutation OpenIssue($repositoryId: ID!, $title: String!, $body: String!, $labelId: [ID!]) {
  createIssue(
    input: {
      repositoryId: $repositoryId, 
      title: $title, 
      body: $body, 
      labelIds: $labelId
    }
  ) {
    issue {
      id
      number
    }
  }
}`;

export const Close = `mutation CloseIssue($issueId: ID!) {
  closeIssue(
    input: {
      issueId: $issueId
    }
  ) {
    issue {
      id
      number
    }
  }
}`;

export const RemoveLabel = `
mutation RemoveLabel($issueId: ID!, $labelId: [ID!]!) {
  removeLabelsFromLabelable(
    input: {
      labelIds: $labelId,
      labelableId: $issueId
    }
  ) {
    labelable {
      labels(first: 10) {
        nodes {
          id
        }
      }
    }
  }
}`;

export const AddLabel = `
mutation AddLabel($issueId: ID!, $labelId: [ID!]!) {
  addLabelsToLabelable(input: {labelIds: $labelId, labelableId: $issueId}) {
    labelable {
      labels(first: 10) {
        nodes {
          id
        }
      }
    }
  }
}`;