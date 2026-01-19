
export const convertToJSON = (data: any) => {
  return JSON.stringify(data, null, 2);
};

export const convertAnatomyToTree = (anatomyData: any): string => {
  if (!anatomyData || typeof anatomyData !== 'object') {
    return '';
  }

  interface TreeNode {
    name: string;
    type: string;
    path: string;
    parentPath: string;
    children: TreeNode[];
  }

  // Helper function to build tree from flat anatomy (array or object)
  function buildTreeFromAnatomy(anatomy: any): TreeNode[] {
    let nodesArray: any[] = [];

    // Check if anatomy is array or object
    if (Array.isArray(anatomy)) {
      nodesArray = anatomy;
    } else {
      // Convert object to array for backwards compatibility
      nodesArray = Object.keys(anatomy).map(nodeName => ({
        name: nodeName,
        type: anatomy[nodeName].type,
        path: anatomy[nodeName].path,
        parentPath: anatomy[nodeName].path.split(' > ').slice(0, -1).join(' > ')
      }));
    }

    // Build hierarchical structure while preserving order
    const rootNodes: TreeNode[] = [];
    const nodesByPath = new Map<string, TreeNode>();

    for (const nodeData of nodesArray) {
      const treeNode: TreeNode = {
        name: nodeData.name,
        type: nodeData.type || 'UNKNOWN',
        path: nodeData.path || nodeData.name,
        parentPath: nodeData.parentPath || '',
        children: []
      };

      // Store node by its path (with index to handle duplicates)
      const pathKey = nodeData.path || nodeData.name;
      nodesByPath.set(pathKey, treeNode);

      // Add to parent or root
      if (!nodeData.parentPath || nodeData.parentPath === '') {
        rootNodes.push(treeNode);
      } else {
        const parent = nodesByPath.get(nodeData.parentPath);
        if (parent) {
          parent.children.push(treeNode);
        } else {
          // If parent not found, add to root (shouldn't happen normally)
          rootNodes.push(treeNode);
        }
      }
    }

    return rootNodes;
  }

  // Helper function to render tree
  function renderTree(rootNodes: TreeNode[]): string {
    const lines: string[] = [];

    function renderNode(node: TreeNode, prefix: string, isLast: boolean, isRoot: boolean = false) {
      if (isRoot) {
        // Root node with special formatting
        lines.push(`📦 ${node.name}`);
        lines.push(`   └─ type: ${node.type}`);
      } else {
        // Child nodes with tree structure
        const connector = isLast ? '└─ ' : '├─ ';
        const typeInfo = node.type ? ` (${node.type})` : '';
        const line = `${prefix}${connector}${node.name}${typeInfo}`;
        lines.push(line);
      }

      const childPrefix = isRoot
        ? '   '
        : prefix + (isLast ? '   ' : '│  ');

      node.children.forEach((child, index) => {
        const isLastChild = index === node.children.length - 1;
        renderNode(child, childPrefix, isLastChild, false);
      });
    }

    rootNodes.forEach((root, index) => {
      if (index > 0) {
        lines.push(''); // Add blank line between root components
      }
      renderNode(root, '', true, true);
    });

    return lines.join('\n');
  }

  // Helper function to compare anatomies (supports both array and object)
  function compareAnatomies(anat1: any, anat2: any): boolean {
    // Convert to arrays if needed
    const arr1 = Array.isArray(anat1) ? anat1 : Object.keys(anat1).map(k => anat1[k]);
    const arr2 = Array.isArray(anat2) ? anat2 : Object.keys(anat2).map(k => anat2[k]);

    if (arr1.length !== arr2.length) return false;

    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i].name !== arr2[i].name) return false;
      if (arr1[i].type !== arr2[i].type) return false;
      if (arr1[i].path !== arr2[i].path) return false;
    }

    return true;
  }

  // Check if anatomyData contains variants (nested structure)
  const firstKey = Object.keys(anatomyData)[0];
  const firstValue = anatomyData[firstKey];
  const isVariantBased = firstValue &&
                         (Array.isArray(firstValue) ||
                          (typeof firstValue === 'object' &&
                           firstValue.type === undefined &&
                           firstValue.path === undefined));

  if (isVariantBased) {
    // Handle variant-based anatomy
    const variants = Object.keys(anatomyData);
    const lines: string[] = [];

    // Group variants by identical anatomy
    const anatomyGroups: Map<string, string[]> = new Map();

    for (const variantName of variants) {
      const variantAnatomy = anatomyData[variantName];
      let foundGroup = false;

      for (const [signature, variantList] of anatomyGroups.entries()) {
        const existingAnatomy = anatomyData[variantList[0]];
        if (compareAnatomies(variantAnatomy, existingAnatomy)) {
          variantList.push(variantName);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        const signature = JSON.stringify(variantAnatomy);
        anatomyGroups.set(signature, [variantName]);
      }
    }

    // If all variants have the same anatomy, show it once
    if (anatomyGroups.size === 1) {
      const firstVariant = variants[0];
      const rootNodes = buildTreeFromAnatomy(anatomyData[firstVariant]);
      return renderTree(rootNodes);
    }

    // Otherwise, show each group separately
    let groupIndex = 0;
    for (const [_, variantList] of anatomyGroups.entries()) {
      if (groupIndex > 0) {
        lines.push('');
        lines.push('─'.repeat(60));
        lines.push('');
      }

      // Header showing which variants share this structure
      if (variantList.length === 1) {
        lines.push(`[Variant: ${variantList[0]}]`);
      } else {
        lines.push(`[Variants: ${variantList.join(', ')}]`);
      }
      lines.push('');

      const rootNodes = buildTreeFromAnatomy(anatomyData[variantList[0]]);
      lines.push(renderTree(rootNodes));

      groupIndex++;
    }

    return lines.join('\n');
  } else {
    // Handle single component anatomy (non-variant)
    const rootNodes = buildTreeFromAnatomy(anatomyData);
    return renderTree(rootNodes);
  }
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
