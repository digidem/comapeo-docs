import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';
import {translate} from '@docusaurus/Translate';

type FeatureItem = {
  id: string;
  title: string;
  image: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    id: 'conversational-guidance',
    title: translate({
      message: 'Conversational Guidance',
      description: 'Feature title for voice-enabled QA bots section',
    }),
    image: 'bot.jpg',
    description: (
      <>
        {translate({
          message: 'Get instant voice assistance through our documentation bots that listen to your questions and respond with precise answers in real-time.',
          description: 'Description for voice-enabled QA bots section',
        })}
      </>
    ),
  },
  {
    id: 'multi-lingual-documentation',
    title: translate({
      message: 'Map in Any Language',
      description: 'Feature title for multi-lingual documentation section',
    }),
    image: 'locale.jpg',
    description: (
      <>
        {translate({
          message: 'Access CoMapeo documentation in multiple languages, ensuring every team member can learn and contribute regardless of their native tongue.',
          description: 'Description for multi-lingual documentation section',
        })}
      </>
    ),
  },
  {
    id: 'comprehensive-learning-hub',
    title: translate({
      message: 'Your Mapping Journey Starts Here',
      description: 'Feature title for comprehensive learning hub section',
    }),
    image: 'hub.jpg',
    description: (
      <>
        {translate({
          message: 'Everything you need to master the CoMapeo platform, from beginner tutorials to advanced techniques, all in one centralized knowledge center.',
          description: 'Description for comprehensive learning hub section',
        })}
      </>
    ),
  },
];

function Feature({title, image, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <img src={`/img/${image}`} className={styles.featureSvg} alt={title} />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props) => (
            <Feature key={props.id} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
