export interface TranslationFailure {
  language: string;
  title: string;
  pageId?: string;
  error: string;
  isCritical: boolean;
}

export interface NavbarItem {
  label?: string;
  type?: string;
  sidebarId?: string;
  position?: string;
  href?: string;
}

export interface FooterLink {
  label?: string;
  href?: string;
}

export interface FooterSection {
  title?: string;
  items?: FooterLink[];
}

export interface NavbarLogo {
  alt?: string;
}

export interface NavbarConfig {
  items?: NavbarItem[];
  logo?: NavbarLogo;
}

export interface FooterConfig {
  links?: FooterSection[];
  copyright?: string;
}

export type TranslatableDictionary = Record<
  string,
  { message: string; description: string }
>;
