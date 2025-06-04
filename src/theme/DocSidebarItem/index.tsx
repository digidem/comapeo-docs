import React, {type ReactNode} from 'react';
import DocSidebarItem from '@theme-original/DocSidebarItem';
import type DocSidebarItemType from '@theme/DocSidebarItem';
import type {WrapperProps} from '@docusaurus/types';
import {translate} from '@docusaurus/Translate';

type Props = WrapperProps<typeof DocSidebarItemType>;

export default function DocSidebarItemWrapper(props: Props): ReactNode {
  props.item.label = translate({message: props.item.label})
  return (
    <>
      {props.item.customProps?.title && (
        <div style={{
          fontSize: '0.75rem',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          padding: '0.8rem 0.75rem 0',
          opacity: 0.8
        }}>
        {translate({message:props.item.customProps.title})}
        </div>
      )}
      <DocSidebarItem {...props} />
    </>
  );
}
