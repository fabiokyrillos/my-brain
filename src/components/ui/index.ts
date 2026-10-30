/**
 * The Life Brain primitive layer (ADR-145 Decision 2).
 *
 * Presentational only: no data access, no domain rules, no locale ternaries.
 * Copy arrives as props from a typed `copy.ts`. Styles: `src/app/ui.css`.
 * Direction and rules of use: `docs/initiatives/life-brain/DESIGN_DIRECTION.md` §4.
 */
export { Badge, badgeVariants, type BadgeProps } from "./badge";
export { Button, ButtonLink, IconButton, buttonVariants, type ButtonLinkProps, type ButtonProps, type IconButtonProps } from "./button";
export { Card, cardVariants, type CardProps } from "./card";
export { EmptyState, emptyStateVariants, type EmptyStateProps } from "./empty-state";
export { Field, Input, Select, Textarea, fieldDescribedBy, type FieldProps, type InputProps, type SelectProps, type TextareaProps } from "./field";
export { List, ListItem, listItemVariants, type ListItemProps } from "./list-item";
export { PageHeader, pageHeaderVariants, type PageHeaderProps } from "./page-header";
export { SegmentedControl, segmentedVariants, type SegmentedControlProps, type SegmentedOption } from "./segmented-control";
export { TextLink, textLinkVariants, type TextLinkProps } from "./text-link";
export { cn } from "./cn";
