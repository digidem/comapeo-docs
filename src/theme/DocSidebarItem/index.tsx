import React, {type ReactNode} from 'react';
import DocSidebarItem from '@theme-original/DocSidebarItem';
import type DocSidebarItemType from '@theme/DocSidebarItem';
import type {WrapperProps} from '@docusaurus/types';

type Props = WrapperProps<typeof DocSidebarItemType>;

export default function DocSidebarItemWrapper(props: Props): ReactNode {
  console.log('DocSidebar PROPS', props);
  console.log('DocSidebarItemWrapper', props.item.customProps);
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
          {props.item.customProps.title}
        </div>
      )}
      <DocSidebarItem {...props} />
    </>
  );
}
