
export const MOCK_COMPONENTS = [
  { id: '1', name: 'Button', type: 'COMPONENT_SET' },
  { id: '2', name: 'Input', type: 'COMPONENT_SET' },
  { id: '3', name: 'Checkbox', type: 'COMPONENT' },
  { id: '4', name: 'Card', type: 'COMPONENT' },
  { id: '5', name: 'Avatar', type: 'COMPONENT_SET' },
  { id: '6', name: 'Badge', type: 'COMPONENT_SET' },
  { id: '7', name: 'Select', type: 'COMPONENT_SET' },
  { id: '8', name: 'Modal', type: 'COMPONENT' },
  { id: '9', name: 'Tooltip', type: 'COMPONENT' },
  { id: '10', name: 'Accordion', type: 'COMPONENT_SET' },
];

export const MOCK_ExportION_RESULT = {
  Button: {
    description: "A clickable button element",
    props: {
      variant: {
        type: "enum",
        values: ["primary", "secondary", "ghost", "destructive"],
        defaultValue: "primary"
      },
      size: {
        type: "enum",
        values: ["sm", "md", "lg"],
        defaultValue: "md"
      },
      disabled: {
        type: "boolean",
        defaultValue: false
      },
      label: {
        type: "string",
        defaultValue: "Button"
      },
      iconLeft: {
        type: "instance",
        defaultValue: null
      }
    },
    anatomy: ["container", "label", "icon"],
    styles: {
      width: "fill-container",
      height: "hug-contents",
      padding: "12px 24px"
    }
  },
  Input: {
    description: "Text input field",
    props: {
      placeholder: {
        type: "string",
        defaultValue: "Type here..."
      },
      error: {
        type: "boolean",
        defaultValue: false
      },
      value: {
        type: "string",
        defaultValue: ""
      }
    }
  }
};
