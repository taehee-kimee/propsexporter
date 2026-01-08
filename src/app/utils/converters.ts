
export const convertToJSON = (data: any) => {
  return JSON.stringify(data, null, 2);
};

export const convertToYAML = (data: any, indent = 0): string => {
  const indentStr = '  '.repeat(indent);
  let result = '';
  
  for (const key in data) {
    const value = data[key];
    
    if (value === null || value === undefined) {
      result += `${indentStr}${key}: null\n`;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      result += `${indentStr}${key}:\n`;
      result += convertToYAML(value, indent + 1);
    } else if (Array.isArray(value)) {
      result += `${indentStr}${key}:\n`;
      value.forEach(item => {
        if (typeof item === 'object') {
          result += `${indentStr}  -\n`;
          const itemYaml = convertToYAML(item, indent + 2);
          result += itemYaml.split('\n').map(line => 
            line ? `  ${line}` : line
          ).join('\n');
        } else {
          result += `${indentStr}  - ${formatYAMLValue(item)}\n`;
        }
      });
    } else {
      result += `${indentStr}${key}: ${formatYAMLValue(value)}\n`;
    }
  }
  
  return result;
};

function formatYAMLValue(value: any) {
  if (typeof value === 'string') {
    if (value.includes(':') || value.includes('#') || value.includes('\n') || 
        value.startsWith(' ') || value.endsWith(' ')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  } else if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  } else if (typeof value === 'number') {
    return value.toString();
  }
  return String(value);
}

export const convertToTypeScript = (data: any) => {
  let result = '';
  
  for (const componentName in data) {
    const component = data[componentName];
    const cleanName = componentName.replace(/\s+/g, '');
    const props = component.props || {};
    const anatomy = component.anatomy || {};
    const elementStyles = component.elementStyles || {};
    const tokens = component.tokens || {};
    
    // Props Interface
    if (Object.keys(props).length > 0) {
      result += `interface ${cleanName}Props {\n`;
      
      for (const propName in props) {
        const prop = props[propName];
        let typeString = 'any';
        
        if (prop.type === 'boolean') {
          typeString = 'boolean';
        } else if (prop.type === 'string') {
          typeString = 'string';
        } else if (prop.type === 'enum') {
          const values = prop.values ? prop.values.map((v: string) => `'${v}'`).join(' | ') : 'string';
          typeString = values;
        } else if (prop.type === 'instance') {
          typeString = 'React.ReactNode';
        } else if (prop.type === 'number') {
          typeString = 'number';
        }
        
        result += `  ${propName}: ${typeString};\n`;
      }
      
      result += `}\n\n`;
    }
    
    // Anatomy Interface
    if (Object.keys(anatomy).length > 0) {
      result += `interface ${cleanName}Anatomy {\n`;
      
      for (const nodeName in anatomy) {
        const node = anatomy[nodeName];
        result += `  ${nodeName}: '${node.type}'; // ${node.path}\n`;
      }
      
      result += `}\n\n`;
    }
    
    // Styles Interface
    if (Object.keys(elementStyles).length > 0) {
      result += `interface ${cleanName}Styles {\n`;
      
      for (const nodeName in elementStyles) {
        const style = elementStyles[nodeName];
        result += `  ${nodeName}: {\n`;
        
        if (style.fills) result += `    fills?: any;\n`;
        if (style.strokes) result += `    strokes?: any;\n`;
        if (style.effects) result += `    effects?: any;\n`;
        if (style.fontSize) result += `    fontSize?: number;\n`;
        if (style.fontWeight) result += `    fontWeight?: number;\n`;
        if (style.width) result += `    width?: number;\n`;
        if (style.height) result += `    height?: number;\n`;
        if (style.padding) result += `    padding?: number;\n`;
        if (style.cornerRadius !== undefined) result += `    cornerRadius?: number;\n`;
        
        result += `  };\n`;
      }
      
      result += `}\n\n`;
    }
    
    // Tokens Interface
    if (Object.keys(tokens).length > 0) {
      result += `interface ${cleanName}Tokens {\n`;
      
      for (const nodeName in tokens) {
        const nodeTokens = tokens[nodeName];
        if (Object.keys(nodeTokens).length > 0) {
          result += `  ${nodeName}: {\n`;
          
          for (const tokenKey in nodeTokens) {
            result += `    ${tokenKey}: string;\n`;
          }
          
          result += `  };\n`;
        }
      }
      
      result += `}\n\n`;
    }
  }
  
  return result;
};

export const convertToJSDoc = (data: any) => {
  let result = '';
  
  for (const componentName in data) {
    const component = data[componentName];
    const cleanName = componentName.replace(/\s+/g, '');
    const props = component.props || {};
    const anatomy = component.anatomy || {};
    const elementStyles = component.elementStyles || {};
    const tokens = component.tokens || {};
    
    // Props JSDoc
    if (Object.keys(props).length > 0) {
      result += `/**\n`;
      result += ` * @typedef {Object} ${cleanName}Props\n`;
      
      for (const propName in props) {
        const prop = props[propName];
        let typeString = '*';
        
        if (prop.type === 'boolean') {
          typeString = 'boolean';
        } else if (prop.type === 'string') {
          typeString = 'string';
        } else if (prop.type === 'enum') {
          const values = prop.values ? prop.values.map((v: string) => `'${v}'`).join('|') : 'string';
          typeString = `(${values})`;
        } else if (prop.type === 'instance') {
          typeString = 'ReactNode';
        } else if (prop.type === 'number') {
          typeString = 'number';
        }
        
        result += ` * @property {${typeString}} ${propName}\n`;
      }
      
      result += ` */\n\n`;
    }
    
    // Anatomy JSDoc
    if (Object.keys(anatomy).length > 0) {
      result += `/**\n`;
      result += ` * @typedef {Object} ${cleanName}Anatomy\n`;
      
      for (const nodeName in anatomy) {
        const node = anatomy[nodeName];
        result += ` * @property {string} ${nodeName} - ${node.type} (${node.path})\n`;
      }
      
      result += ` */\n\n`;
    }
    
    // Styles JSDoc
    if (Object.keys(elementStyles).length > 0) {
      result += `/**\n`;
      result += ` * @typedef {Object} ${cleanName}Styles\n`;
      
      for (const nodeName in elementStyles) {
        result += ` * @property {Object} ${nodeName}\n`;
      }
      
      result += ` */\n\n`;
    }
    
    // Tokens JSDoc
    if (Object.keys(tokens).length > 0) {
      result += `/**\n`;
      result += ` * @typedef {Object} ${cleanName}Tokens\n`;
      
      for (const nodeName in tokens) {
        result += ` * @property {Object} ${nodeName}\n`;
      }
      
      result += ` */\n\n`;
    }
  }
  
  return result;
};
