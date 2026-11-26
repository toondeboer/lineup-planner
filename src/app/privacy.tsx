import { Card, Heading, Muted, Screen, Text } from '../ui/components';

function P({ children }: { children: string }) {
  return <Text>{children}</Text>;
}

/** What sharing a team stores, where, and how to remove it. */
export default function PrivacyScreen() {
  return (
    <Screen>
      <Card>
        <Heading>Without sharing</Heading>
        <P>
          Your squad, ratings and match setup are stored only on this phone (or in this browser). Nothing is sent
          anywhere. Clearing the app's data or the browser's site data removes them.
        </P>
      </Card>
      <Card>
        <Heading>When you share a team</Heading>
        <P>
          The team is stored on a server so that its coaches can work on it together. It holds: the team name, the
          names you give the coaches who join, when each coach last opened the app, the players' names and position
          ratings, and the setup of the upcoming match (availability, guests, formation, keepers).
        </P>
        <P>
          There are no accounts, email addresses or passwords. Each phone gets a secret key when it joins; the server
          keeps only a scrambled form of it. The server does not track you and keeps no record of what you change,
          only the current team.
        </P>
        <P>
          The server runs on Amazon Web Services in Frankfurt, Germany, so the data stays in the EU. Technical
          logs contain no names and are deleted after 14 days.
        </P>
      </Card>
      <Card>
        <Heading>Who can see it</Heading>
        <P>
          Everyone who joined with the invite link can see and change the whole team, including the ratings. Share
          the link with coaches only, not in a group with players or parents. You can make a new link at any time;
          the old one then stops working.
        </P>
        <P>For youth teams, consider using first names or nicknames for the players.</P>
      </Card>
      <Card>
        <Heading>Removing it</Heading>
        <P>
          On the team screen, "Delete team for everyone" removes the team from the server straight away. When the
          last coach leaves, the team is removed too. A coach who leaves or is removed is taken off the coaches list.
          Each phone keeps its own copy of the squad until you remove it there.
        </P>
      </Card>
      <Muted>Last updated: 25 November 2026.</Muted>
    </Screen>
  );
}
