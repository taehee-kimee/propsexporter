// This is the main plugin code that runs in Figma's backend
// It doesn't have access to the browser or DOM, only to the Figma API

// Helper function to add timeout to async operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
    )
  ]);
}

// Show the plugin UI window (larger size for two-column layout)
figma.showUI(__html__, { width: 800, height: 600 });

// Components will be loaded when requested by the UI

// Send initial selection state
function sendSelectionUpdate() {
  const selection = figma.currentPage.selection;
  if (selection.length === 1) {
    const node = selection[0];
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE') {
      // Export component properties for display
      const properties: Record<string, string> = {};

      // Get property definitions
      let propertyDefinitions;
      let nodeName = node.name;

      if (node.type === 'INSTANCE') {
        // For instances, get the component properties and their current values
        const instanceNode = node as InstanceNode;

        // For selection preview, read directly from componentProperties (fast, works for all instances)
        const componentProps = instanceNode.componentProperties;
        if (componentProps) {
          for (const propKey in componentProps) {
            const propValue = componentProps[propKey];
            const propName = propKey.split('#')[0];

            // componentProperties values are objects with 'value' and 'type'
            if (propValue && typeof propValue === 'object' && 'value' in propValue) {
              const val = (propValue as any).value;
              const propType = (propValue as any).type;

              if (propType === 'VARIANT' || propType === 'BOOLEAN' || propType === 'TEXT') {
                properties[propName] = String(val);
              } else if (propType === 'INSTANCE_SWAP') {
                properties[propName] = val ? 'instance' : 'none';
              }
            }
          }
        }

        // Use instance name for display (fast fallback)
        // Format: "ComponentName, Variant=Value" -> "ComponentName"
        nodeName = instanceNode.name.split(',')[0].trim();
      } else if (node.type === 'COMPONENT') {
        const componentNode = node as ComponentNode;
        
        if (componentNode.parent && componentNode.parent.type === 'COMPONENT_SET') {
          // This is a variant, get properties from the parent ComponentSet
          propertyDefinitions = componentNode.parent.componentPropertyDefinitions;
          nodeName = componentNode.parent.name;
          
          // Get the actual values from this variant's name
          // Variant names are like "Size=Small, State=Hover"
          const variantProps = componentNode.name.split(', ');
          for (const prop of variantProps) {
            const [key, value] = prop.split('=');
            if (key && value) {
              properties[key.trim()] = value.trim();
            }
          }
        } else {
          // This is a standalone component
          propertyDefinitions = componentNode.componentPropertyDefinitions;
          
          // Export default values
          if (propertyDefinitions) {
            for (const propKey in propertyDefinitions) {
              const propDef = propertyDefinitions[propKey];
              const propName = propKey.split('#')[0];
              
              if (propDef.type === 'VARIANT') {
                const defaultValue = propDef.defaultValue || propDef.variantOptions?.[0] || '';
                properties[propName] = String(defaultValue);
              } else if (propDef.type === 'BOOLEAN') {
                properties[propName] = String(propDef.defaultValue || false);
              } else if (propDef.type === 'TEXT') {
                const textValue = propDef.defaultValue || '';
                properties[propName] = String(textValue);
              } else if (propDef.type === 'INSTANCE_SWAP') {
                properties[propName] = propDef.defaultValue ? 'instance' : 'none';
              }
            }
          }
        }
      } else if (node.type === 'COMPONENT_SET') {
        propertyDefinitions = node.componentPropertyDefinitions;
        // For component sets, show available properties with default values
        if (propertyDefinitions) {
          for (const propKey in propertyDefinitions) {
            const propDef = propertyDefinitions[propKey];
            const propName = propKey.split('#')[0];
            
            if (propDef.type === 'VARIANT') {
              const defaultValue = propDef.defaultValue || propDef.variantOptions?.[0] || '';
              properties[propName] = String(defaultValue);
            } else if (propDef.type === 'BOOLEAN') {
              properties[propName] = String(propDef.defaultValue || false);
            } else if (propDef.type === 'TEXT') {
              const textValue = propDef.defaultValue || '';
              properties[propName] = String(textValue);
            } else if (propDef.type === 'INSTANCE_SWAP') {
              properties[propName] = propDef.defaultValue ? 'instance' : 'none';
            }
          }
        }
      }
      
      figma.ui.postMessage({
        type: 'selection-changed',
        selection: {
          name: nodeName,
          type: node.type,
          properties: properties
        }
      });
      return;
    }
  }
  // No valid selection
  figma.ui.postMessage({
    type: 'selection-changed',
    selection: null
  });
}

// Send initial selection
sendSelectionUpdate();

// Listen for selection changes
figma.on('selectionchange', () => {
  sendSelectionUpdate();
});

// Listen for messages from the UI
figma.ui.onmessage = async (msg) => {
  // When the UI asks to Export properties from current selection
  if (msg.type === 'Export-properties') {
    await ExportComponentProperties(msg.options);
  }
  
  // When the UI asks to get all components in the file
  if (msg.type === 'get-components') {
    await getAllComponents(msg.forceRefresh || false);
  }
  
  // When the UI asks to refresh components (clear cache)
  if (msg.type === 'refresh-components') {
    await figma.clientStorage.deleteAsync('componentsCache');
    await getAllComponents(true);
  }
  
  // When the UI asks to Export multiple components
  if (msg.type === 'Export-multiple') {
    await ExportMultipleComponents(msg.componentIds, msg.options);
  }
  
  // When the UI asks to close the plugin
  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

/**
 * Main function to Export component properties from the current selection
 */
async function ExportComponentProperties(options: any) {
  console.log('[ExportComponentProperties] Starting with options:', JSON.stringify(options));

  // Get the currently selected node in Figma
  const selection = figma.currentPage.selection;
  console.log('[ExportComponentProperties] Selection length:', selection.length);

  // Check if exactly one node is selected
  if (selection.length === 0) {
    console.log('[ExportComponentProperties] No selection');
    sendError('Please select a component or component set.');
    return;
  }

  if (selection.length > 1) {
    console.log('[ExportComponentProperties] Multiple selections');
    sendError('Please select only one component or component set.');
    return;
  }

  const node = selection[0];
  console.log('[ExportComponentProperties] Selected node type:', node.type, 'name:', node.name);

  try {
    // Check if the selected node is a Component or ComponentSet
    if (node.type === 'COMPONENT') {
      // Single component
      console.log('[ExportComponentProperties] Calling ExportFromComponent');
      const result = await withTimeout(
        ExportFromComponent(node, options),
        30000,
        'Export operation timed out after 30 seconds'
      );
      console.log('[ExportComponentProperties] ExportFromComponent completed');
      console.log('[ExportComponentProperties] Result keys:', Object.keys(result));
      sendSuccess(result);
    } else if (node.type === 'COMPONENT_SET') {
      // Component set (variants)
      console.log('[ExportComponentProperties] Calling ExportFromComponentSet');
      const result = await withTimeout(
        ExportFromComponentSet(node, options),
        30000,
        'Export operation timed out after 30 seconds'
      );
      console.log('[ExportComponentProperties] ExportFromComponentSet completed');
      console.log('[ExportComponentProperties] Result keys:', Object.keys(result));
      sendSuccess(result);
    } else {
      console.log('[ExportComponentProperties] Invalid node type:', node.type);
      sendError('Selected node must be a Component or Component Set. You selected: ' + node.type);
    }
  } catch (error: any) {
    console.error('[ExportComponentProperties] Error:', error);
    console.error('[ExportComponentProperties] Error stack:', error.stack);
    sendError('Export failed: ' + String(error));
  }
}

/**
 * Export properties from a single Component
 */
async function ExportFromComponent(component: ComponentNode, options: any) {
  console.log('[ExportFromComponent] Starting for:', component.name);
  const componentName = component.name;
  const result: any = {
    [componentName]: {}
  };

  // Export properties if selected
  if (options.property) {
    console.log('[ExportFromComponent] Exporting properties');
    // Check if this is a variant component (child of ComponentSet)
    let propertyDefinitions;
    if (component.parent && component.parent.type === 'COMPONENT_SET') {
      // This is a variant, get properties from the parent ComponentSet
      propertyDefinitions = component.parent.componentPropertyDefinitions;
    } else {
      // This is a standalone component
      propertyDefinitions = component.componentPropertyDefinitions;
    }
    result[componentName].props = ExportProperties(propertyDefinitions);
  }

  // Export anatomy if selected
  if (options.anatomy) {
    console.log('[ExportFromComponent] Exporting anatomy');
    result[componentName].anatomy = ExportAnatomy(component);
  }

  // Export element styles if selected
  if (options.elementStyles) {
    console.log('[ExportFromComponent] Exporting element styles');
    result[componentName].elementStyles = await ExportElementStyles(component);
    console.log('[ExportFromComponent] Element styles completed');
  }

  // Export figma styles if selected
  if (options.figmaStyles) {
    console.log('[ExportFromComponent] Exporting figma styles');
    result[componentName].figmaStyles = await ExportFigmaStyles(component);
    console.log('[ExportFromComponent] Figma styles completed');
  }

  // Export tokens if selected
  if (options.tokens) {
    console.log('[ExportFromComponent] Exporting tokens');
    result[componentName].tokens = await ExportTokens(component);
    console.log('[ExportFromComponent] Tokens completed');
  }

  console.log('[ExportFromComponent] All exports completed');
  return result;
}

/**
 * Export properties from a ComponentSet (variants)
 */
async function ExportFromComponentSet(componentSet: ComponentSetNode, options: any) {
  const componentName = componentSet.name;
  const result: any = {
    [componentName]: {}
  };

  // Export properties if selected
  if (options.property) {
    result[componentName].props = ExportProperties(componentSet.componentPropertyDefinitions);
  }

  // Export anatomy if selected
  if (options.anatomy) {
    result[componentName].anatomy = ExportAnatomy(componentSet);
  }

  // Export element styles if selected
  if (options.elementStyles) {
    result[componentName].elementStyles = await ExportElementStyles(componentSet);
  }

  // Export figma styles if selected
  if (options.figmaStyles) {
    result[componentName].figmaStyles = await ExportFigmaStyles(componentSet);
  }

  // Export tokens if selected
  if (options.tokens) {
    result[componentName].tokens = await ExportTokens(componentSet);
  }

  return result;
}

/**
 * Export component properties
 */
function ExportProperties(componentProperties: any): any {
  const props: any = {};
  
  // If no properties, return empty props
  if (!componentProperties) {
    return {};
  }
  
  // Loop through each property definition
  for (const propKey in componentProperties) {
    const propDef = componentProperties[propKey];
    // Remove the random ID suffix (e.g., "Clearable#18924:0" -> "Clearable")
    const propName = propKey.split('#')[0];
    
    // Check the type of property
    if (propDef.type === 'BOOLEAN') {
      // Boolean property (true/false)
      props[propName] = {
        type: 'boolean'
      };
    } else if (propDef.type === 'VARIANT') {
      // Check if it's a true boolean (has only true/false values) or enum
      const options = propDef.variantOptions || [];
      const isBooleanVariant = options.length === 2 && 
        options.includes('true') && options.includes('false');
      
      if (isBooleanVariant) {
        // Boolean disguised as variant
        props[propName] = {
          type: 'boolean'
        };
      } else {
        // Variant property (enum with options)
        props[propName] = {
          type: 'enum',
          values: options
        };
      }
    } else if (propDef.type === 'TEXT') {
      // Text property
      props[propName] = {
        type: 'string',
        default: propDef.defaultValue || ''
      };
    } else if (propDef.type === 'INSTANCE_SWAP') {
      // Instance swap property
      props[propName] = {
        type: 'instance'
      };
    }
  }
  
  return props;
}

/**
 * Export anatomy (child structure) from a component
 * For ComponentSet, exports anatomy from all variants to detect differences
 * Returns array to preserve order and handle duplicate names
 */
function ExportAnatomy(node: ComponentNode | ComponentSetNode): any {
  // For ComponentSet with multiple variants, export anatomy from each variant
  if (node.type === 'COMPONENT_SET' && node.children.length > 0) {
    const variantAnatomies: any = {};

    for (const variant of node.children) {
      if (variant.type === 'COMPONENT') {
        const variantName = variant.name;
        const anatomy: any[] = [];

        function traverseNode(n: SceneNode, path: string = '', parentPath: string = '') {
          const nodeName = n.name;
          const fullPath = path ? `${path} > ${nodeName}` : nodeName;

          anatomy.push({
            name: nodeName,
            type: n.type,
            path: fullPath,
            parentPath: parentPath
          });

          // If node has children, traverse them in order
          if ('children' in n) {
            for (const child of n.children) {
              traverseNode(child, fullPath, fullPath);
            }
          }
        }

        // Traverse variant's children in order
        if ('children' in variant) {
          for (const child of variant.children) {
            traverseNode(child, '', '');
          }
        }

        variantAnatomies[variantName] = anatomy;
      }
    }

    return variantAnatomies;
  }
  // For regular Component, export single anatomy
  else if ('children' in node) {
    const anatomy: any[] = [];

    function traverseNode(n: SceneNode, path: string = '', parentPath: string = '') {
      const nodeName = n.name;
      const fullPath = path ? `${path} > ${nodeName}` : nodeName;

      anatomy.push({
        name: nodeName,
        type: n.type,
        path: fullPath,
        parentPath: parentPath
      });

      // If node has children, traverse them in order
      if ('children' in n) {
        for (const child of n.children) {
          traverseNode(child, fullPath, fullPath);
        }
      }
    }

    // Traverse children in order
    for (const child of node.children) {
      traverseNode(child, '', '');
    }

    return anatomy;
  }

  return [];
}

/**
 * Export element styles (inline styles) from a component
 */
async function ExportElementStyles(node: ComponentNode | ComponentSetNode): Promise<any> {
  console.log('[ExportElementStyles] Starting for node:', node.name);
  const styles: any = {};
  let nodeCount = 0;

  async function getNodeStyles(n: SceneNode): Promise<any> {
    console.log('[getNodeStyles] Processing node:', n.name, 'type:', n.type);
    const nodeStyles: any = {
      name: n.name,
      type: n.type
    };

    // Get bound variables to check for tokens
    const boundVariables = n.boundVariables;

    // Helper function to get token name or actual value
    async function getValueOrToken(propertyName: string, actualValue: any): Promise<any> {
      if (boundVariables && propertyName in boundVariables) {
        const varRef = (boundVariables as any)[propertyName];
        if (varRef && 'id' in varRef) {
          try {
            const variable = await figma.variables.getVariableByIdAsync(varRef.id);
            if (variable) {
              return `$${variable.name}`;
            }
          } catch (e) {
            // Variable might not exist, return actual value
          }
        }
      }
      return actualValue;
    }

    // Export fill/stroke properties
    if ('fills' in n && Array.isArray(n.fills)) {
      console.log('[getNodeStyles] Processing fills for:', n.name);
      // Check if fills are bound to a variable
      if (boundVariables && 'fills' in boundVariables && Array.isArray(boundVariables.fills)) {
        const fillTokens = [];
        for (const fillVar of boundVariables.fills) {
          if (fillVar && 'id' in fillVar) {
            try {
              const variable = await figma.variables.getVariableByIdAsync(fillVar.id);
              if (variable) {
                fillTokens.push(`$${variable.name}`);
              }
            } catch (e) {
              // Variable might not exist
            }
          }
        }
        if (fillTokens.length > 0) {
          nodeStyles.fills = fillTokens;
        }
      }

      // If no token found, use actual values
      if (!nodeStyles.fills) {
        nodeStyles.fills = (n.fills as Paint[]).map(fill => {
          if (fill.type === 'SOLID') {
            return {
              type: 'SOLID',
              color: fill.color,
              opacity: fill.opacity
            };
          }
          return { type: fill.type };
        });
      }
      console.log('[getNodeStyles] Fills processed for:', n.name);
    }

    if ('strokes' in n && Array.isArray(n.strokes)) {
      nodeStyles.strokes = (n.strokes as Paint[]).map(stroke => {
        if (stroke.type === 'SOLID') {
          return {
            type: 'SOLID',
            color: stroke.color,
            opacity: stroke.opacity
          };
        }
        return { type: stroke.type };
      });
    }

    // Export text properties
    if (n.type === 'TEXT') {
      console.log('[getNodeStyles] Processing text properties for:', n.name);
      const textNode = n as TextNode;
      nodeStyles.fontSize = await getValueOrToken('fontSize', textNode.fontSize);
      nodeStyles.fontName = textNode.fontName;
      nodeStyles.textAlignHorizontal = textNode.textAlignHorizontal;
      nodeStyles.textAlignVertical = textNode.textAlignVertical;
      nodeStyles.letterSpacing = await getValueOrToken('letterSpacing', textNode.letterSpacing);
      nodeStyles.lineHeight = await getValueOrToken('lineHeight', textNode.lineHeight);
      console.log('[getNodeStyles] Text properties processed for:', n.name);
    }

    // Export layout properties
    if ('layoutMode' in n) {
      console.log('[getNodeStyles] Processing layout properties for:', n.name);
      nodeStyles.layoutMode = n.layoutMode;
      nodeStyles.primaryAxisAlignItems = n.primaryAxisAlignItems;
      nodeStyles.counterAxisAlignItems = n.counterAxisAlignItems;
      nodeStyles.paddingLeft = await getValueOrToken('paddingLeft', n.paddingLeft);
      nodeStyles.paddingRight = await getValueOrToken('paddingRight', n.paddingRight);
      nodeStyles.paddingTop = await getValueOrToken('paddingTop', n.paddingTop);
      nodeStyles.paddingBottom = await getValueOrToken('paddingBottom', n.paddingBottom);
      nodeStyles.itemSpacing = await getValueOrToken('itemSpacing', n.itemSpacing);
      console.log('[getNodeStyles] Layout properties processed for:', n.name);
    }

    // Export size properties
    console.log('[getNodeStyles] Processing size properties for:', n.name);
    nodeStyles.width = await getValueOrToken('width', n.width);
    nodeStyles.height = await getValueOrToken('height', n.height);

    // Export corner radius
    if ('cornerRadius' in n) {
      nodeStyles.cornerRadius = await getValueOrToken('cornerRadius', n.cornerRadius);
    }

    console.log('[getNodeStyles] Completed for:', n.name);
    return nodeStyles;
  }

  async function traverseForStyles(n: SceneNode) {
    nodeCount++;
    console.log('[traverseForStyles] Node', nodeCount, ':', n.name);
    styles[n.name] = await getNodeStyles(n);
    console.log('[traverseForStyles] Completed getNodeStyles for:', n.name);

    // If node has children, traverse them
    if ('children' in n) {
      console.log('[traverseForStyles] Node has', n.children.length, 'children');
      for (const child of n.children) {
        await traverseForStyles(child);
      }
    }
    console.log('[traverseForStyles] Finished traversing:', n.name);
  }

  // For ComponentSet, get the first variant
  if (node.type === 'COMPONENT_SET' && node.children.length > 0) {
    console.log('[ExportElementStyles] Processing COMPONENT_SET, first variant');
    const firstVariant = node.children[0];
    if ('children' in firstVariant) {
      console.log('[ExportElementStyles] First variant has', firstVariant.children.length, 'children');
      for (const child of firstVariant.children) {
        await traverseForStyles(child);
      }
    }
  } else if ('children' in node) {
    // For regular Component, traverse its children
    console.log('[ExportElementStyles] Processing regular COMPONENT with', node.children.length, 'children');
    for (const child of node.children) {
      await traverseForStyles(child);
    }
  }

  console.log('[ExportElementStyles] Completed, processed', nodeCount, 'nodes');
  return styles;
}

/**
 * Export Figma styles (named styles) applied to a component
 */
async function ExportFigmaStyles(node: ComponentNode | ComponentSetNode): Promise<any> {
  console.log('[ExportFigmaStyles] Starting for node:', node.name);
  const figmaStyles: any = {
    fillStyles: [],
    strokeStyles: [],
    textStyles: [],
    effectStyles: []
  };

  async function collectStyles(n: SceneNode) {
    try {
      console.log('[collectStyles] Processing node:', n.name, 'type:', n.type);

      // Collect fill style (check for string type to avoid figma.mixed symbol)
      if ('fillStyleId' in n) {
        console.log('[collectStyles] fillStyleId:', n.fillStyleId, 'type:', typeof n.fillStyleId);
        const fillStyleId = (n as any).fillStyleId;
        if (fillStyleId !== figma.mixed && typeof fillStyleId === 'string' && fillStyleId !== '') {
          try {
            const style = await figma.getStyleByIdAsync(fillStyleId);
            console.log('[collectStyles] Got fill style:', style?.name || 'null');
            if (style) {
              figmaStyles.fillStyles.push({
                node: n.name,
                styleName: style.name
              });
            }
          } catch (e) {
            console.log('[collectStyles] Error fetching fill style:', e);
          }
        }
      }

      // Collect stroke style
      if ('strokeStyleId' in n) {
        const strokeStyleId = (n as any).strokeStyleId;
        if (strokeStyleId !== figma.mixed && typeof strokeStyleId === 'string' && strokeStyleId !== '') {
          try {
            const style = await figma.getStyleByIdAsync(strokeStyleId);
            if (style) {
              figmaStyles.strokeStyles.push({
                node: n.name,
                styleName: style.name
              });
            }
          } catch (e) {
            console.log('[collectStyles] Error fetching stroke style:', e);
          }
        }
      }

      // Collect text style
      if (n.type === 'TEXT') {
        console.log('[collectStyles] Processing TEXT node');
        const textNode = n as TextNode;
        const textStyleId = textNode.textStyleId;
        console.log('[collectStyles] textStyleId:', textStyleId, 'type:', typeof textStyleId, 'isMixed:', textStyleId === figma.mixed);
        
        if (textStyleId !== figma.mixed && typeof textStyleId === 'string' && textStyleId !== '') {
          try {
            console.log('[collectStyles] Fetching text style...');
            const style = await figma.getStyleByIdAsync(textStyleId);
            console.log('[collectStyles] Got text style:', style?.name || 'null');
            if (style) {
              figmaStyles.textStyles.push({
                node: n.name,
                styleName: style.name
              });
            }
          } catch (e) {
            console.log('[collectStyles] Error fetching text style:', e);
          }
        } else {
          console.log('[collectStyles] Skipping textStyleId (mixed or empty)');
        }
      }

      // Collect effect style
      if ('effectStyleId' in n) {
        console.log('[collectStyles] Checking effect style');
        const effectStyleId = (n as any).effectStyleId;
        if (effectStyleId !== figma.mixed && typeof effectStyleId === 'string' && effectStyleId !== '') {
          try {
            const style = await figma.getStyleByIdAsync(effectStyleId);
            if (style) {
              figmaStyles.effectStyles.push({
                node: n.name,
                styleName: style.name
              });
            }
          } catch (e) {
            console.log('[collectStyles] Error fetching effect style:', e);
          }
        }
      }

      // Traverse children
      if ('children' in n) {
        console.log('[collectStyles] Traversing', n.children.length, 'children');
        for (const child of n.children) {
          await collectStyles(child);
        }
      }
      
      console.log('[collectStyles] Completed for:', n.name);
    } catch (error) {
      console.error('[collectStyles] Error processing node:', n.name, error);
    }
  }

  // For ComponentSet, get the first variant
  if (node.type === 'COMPONENT_SET' && node.children.length > 0) {
    const firstVariant = node.children[0];
    if ('children' in firstVariant) {
      for (const child of firstVariant.children) {
        await collectStyles(child);
      }
    }
  } else if ('children' in node) {
    // For regular Component, traverse its children
    for (const child of node.children) {
      await collectStyles(child);
    }
  }

  // Remove empty arrays
  const result: any = {};
  if (figmaStyles.fillStyles.length > 0) result.fillStyles = figmaStyles.fillStyles;
  if (figmaStyles.strokeStyles.length > 0) result.strokeStyles = figmaStyles.strokeStyles;
  if (figmaStyles.textStyles.length > 0) result.textStyles = figmaStyles.textStyles;
  if (figmaStyles.effectStyles.length > 0) result.effectStyles = figmaStyles.effectStyles;

  console.log('[ExportFigmaStyles] Completed');
  console.log('[ExportFigmaStyles] Result:', JSON.stringify(result));
  return result;
}

/**
 * Export design tokens (variables) from a component
 */
async function ExportTokens(node: ComponentNode | ComponentSetNode): Promise<any> {
  console.log('[ExportTokens] Starting for node:', node.name);
  const tokens: any = {
    colors: [],
    spacing: [],
    sizing: [],
    typography: [],
    other: []
  };

  async function collectTokens(n: SceneNode) {
    try {
      console.log('[collectTokens] Processing node:', n.name);
      // Collect bound variables
      const boundVariables = n.boundVariables;
      console.log('[collectTokens] boundVariables:', boundVariables ? Object.keys(boundVariables) : 'none');

      if (boundVariables) {
        // Check fills
        if ('fills' in boundVariables && Array.isArray(boundVariables.fills)) {
          console.log('[collectTokens] Found fills variables:', boundVariables.fills.length);
          for (const fillVar of boundVariables.fills) {
            if (fillVar && 'id' in fillVar) {
              try {
                console.log('[collectTokens] Getting variable by id:', fillVar.id);
                const variable = await withTimeout(
                  figma.variables.getVariableByIdAsync(fillVar.id),
                  5000,
                  'Variable fetch timeout'
                );
                console.log('[collectTokens] Got variable:', variable?.name || 'null');
                if (variable) {
                  tokens.colors.push({
                    node: n.name,
                    variableName: variable.name
                  });
                }
              } catch (e) {
                console.log('[collectTokens] Error getting variable:', e);
              }
            }
          }
          console.log('[collectTokens] Finished processing fills variables');
        }

        // Check other properties that might have variables
        console.log('[collectTokens] Checking other property mappings');
        const propertyMappings = [
          { prop: 'itemSpacing', category: 'spacing' },
          { prop: 'paddingLeft', category: 'spacing' },
          { prop: 'paddingRight', category: 'spacing' },
          { prop: 'paddingTop', category: 'spacing' },
          { prop: 'paddingBottom', category: 'spacing' },
          { prop: 'width', category: 'sizing' },
          { prop: 'height', category: 'sizing' },
          { prop: 'cornerRadius', category: 'sizing' }
        ];

        for (const mapping of propertyMappings) {
          if (mapping.prop in boundVariables) {
            const varRef = (boundVariables as any)[mapping.prop];
            if (varRef && 'id' in varRef) {
              try {
                const variable = await withTimeout(
                  figma.variables.getVariableByIdAsync(varRef.id),
                  5000,
                  'Variable fetch timeout'
                );
                if (variable) {
                  tokens[mapping.category].push({
                    node: n.name,
                    property: mapping.prop,
                    variableName: variable.name
                  });
                }
              } catch (e) {
                console.log('[collectTokens] Error getting variable for', mapping.prop, ':', e);
              }
            }
          }
        }
        console.log('[collectTokens] Finished checking property mappings');
      }

      // Traverse children
      if ('children' in n) {
        console.log('[collectTokens] Node has', n.children.length, 'children');
        for (const child of n.children) {
          await collectTokens(child);
        }
        console.log('[collectTokens] Finished traversing children of:', n.name);
      }
      
      console.log('[collectTokens] Completed for:', n.name);
    } catch (error) {
      console.error('[collectTokens] Error processing node:', n.name, error);
    }
  }

  // For ComponentSet, get the first variant
  if (node.type === 'COMPONENT_SET' && node.children.length > 0) {
    console.log('[ExportTokens] Processing COMPONENT_SET, first variant');
    const firstVariant = node.children[0];
    if ('children' in firstVariant) {
      console.log('[ExportTokens] First variant has', firstVariant.children.length, 'children');
      for (const child of firstVariant.children) {
        await collectTokens(child);
      }
    }
  } else if ('children' in node) {
    // For regular Component, traverse its children
    console.log('[ExportTokens] Processing regular COMPONENT with', node.children.length, 'children');
    for (const child of node.children) {
      await collectTokens(child);
    }
  }

  console.log('[ExportTokens] Finished collecting tokens');

  // Remove empty arrays
  const result: any = {};
  if (tokens.colors.length > 0) result.colors = tokens.colors;
  if (tokens.spacing.length > 0) result.spacing = tokens.spacing;
  if (tokens.sizing.length > 0) result.sizing = tokens.sizing;
  if (tokens.typography.length > 0) result.typography = tokens.typography;
  if (tokens.other.length > 0) result.other = tokens.other;

  console.log('[ExportTokens] Completed');
  console.log('[ExportTokens] Result:', JSON.stringify(result));
  return result;
}

/**
 * Generate a simple hash of component names and IDs for change detection
 */
async function getComponentsHash(): Promise<string> {
  const componentIds: string[] = [];
  
  function findComponentIds(node: BaseNode) {
    if (node.type === 'COMPONENT_SET') {
      const compSet = node as ComponentSetNode;
      if (compSet.key && !compSet.name.startsWith('.')) {
        componentIds.push(`${node.id}:${node.name}`);
      }
    } else if (node.type === 'COMPONENT') {
      if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
        const comp = node as ComponentNode;
        if (comp.key && !comp.name.startsWith('.')) {
          componentIds.push(`${node.id}:${node.name}`);
        }
      }
    }
    
    if ('children' in node) {
      for (const child of node.children) {
        findComponentIds(child);
      }
    }
  }
  
  for (const page of figma.root.children) {
    findComponentIds(page);
  }
  
  // Create a simple hash from sorted IDs
  return componentIds.sort().join('|');
}

/**
 * Get all components and component sets in the current file with caching
 */
async function getAllComponents(forceRefresh: boolean = false) {
  try {
    // Load all pages first (required for accessing page children)
    await figma.loadAllPagesAsync();
    
    const fileKey = figma.fileKey || 'unknown';
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      try {
        const cachedData = await figma.clientStorage.getAsync('componentsCache');
        
        // Verify cached data structure and file match
        if (cachedData && 
            cachedData.fileKey === fileKey && 
            Array.isArray(cachedData.components)) {
          
          console.log('[getAllComponents] Found cached data for this file');
          
          // Send cached data immediately
          figma.ui.postMessage({
            type: 'components-list',
            components: cachedData.components,
            fromCache: false
          });
          
          // Verify if components have changed by doing a quick scan
          const currentHash = await getComponentsHash();
          
          if (currentHash !== cachedData.hash) {
            console.log('[getAllComponents] Components have changed, prompting refresh');
            // Components changed, notify UI to show refresh button
            figma.ui.postMessage({
              type: 'components-list',
              components: cachedData.components,
              fromCache: true // Show refresh button
            });
          } else {
            console.log('[getAllComponents] Components unchanged');
            return;
          }
        } else {
          console.log('[getAllComponents] No valid cache found or different file');
        }
      } catch (error) {
        console.error('[getAllComponents] Error loading cache:', error);
      }
    }
    
    // Fetch fresh data
    console.log('Fetching fresh components');
    const components: any[] = [];
    
    // Find all components in the document
    function findComponents(node: BaseNode) {
      // Only include ComponentSets and standalone Components (not variants)
      if (node.type === 'COMPONENT_SET') {
        // Check if published (has a component key) and not hidden (starts with .)
        const compSet = node as ComponentSetNode;
        if (compSet.key && !compSet.name.startsWith('.')) {
          components.push({
            id: node.id,
            name: node.name,
            type: 'COMPONENT_SET'
          });
        }
      } else if (node.type === 'COMPONENT') {
        // Only add if it's NOT a variant (not a child of ComponentSet)
        if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
          const comp = node as ComponentNode;
          // Check if published (has a component key) and not hidden (starts with .)
          if (comp.key && !comp.name.startsWith('.')) {
            components.push({
              id: node.id,
              name: node.name,
              type: 'COMPONENT'
            });
          }
        }
      }
      
      // Traverse children
      if ('children' in node) {
        for (const child of node.children) {
          findComponents(child);
        }
      }
    }
    
    // Search through all pages
    for (const page of figma.root.children) {
      findComponents(page);
    }
    
    // Save to cache with file key and hash
    const componentsHash = await getComponentsHash();
    
    try {
      await figma.clientStorage.setAsync('componentsCache', {
        fileKey,
        hash: componentsHash,
        components
      });
      console.log('[getAllComponents] Saved', components.length, 'components to cache');
    } catch (error) {
      console.error('[getAllComponents] Failed to save cache:', error);
    }
    
    // Send the list to UI
    figma.ui.postMessage({
      type: 'components-list',
      components: components,
      fromCache: false
    });
  } catch (error) {
    console.error('Error getting components:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Failed to load components'
    });
  }
}

/**
 * Export multiple components by their IDs
 */
async function ExportMultipleComponents(componentIds: string[], options: any) {
  try {
    const results: any = {};

    for (const id of componentIds) {
      const node = await figma.getNodeByIdAsync(id);

      if (!node) {
        continue;
      }

      if (node.type === 'COMPONENT') {
        const result = await withTimeout(
          ExportFromComponent(node as ComponentNode, options),
          30000,
          `Export timeout for component: ${node.name}`
        );
        Object.assign(results, result);
      } else if (node.type === 'COMPONENT_SET') {
        const result = await withTimeout(
          ExportFromComponentSet(node as ComponentSetNode, options),
          30000,
          `Export timeout for component set: ${node.name}`
        );
        Object.assign(results, result);
      }
    }

    if (Object.keys(results).length === 0) {
      sendError('No valid components found to Export.');
    } else {
      sendSuccess(results);
    }
  } catch (error: any) {
    console.error('[ExportMultipleComponents] Error:', error);
    sendError('Export failed: ' + String(error));
  }
}

/**
 * Send success message with JSON result to the UI
 */
function sanitizeForPostMessage(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  // Figma uses `figma.mixed` (a Symbol) for "mixed values" (e.g. text styles)
  // Symbols/functions cannot be sent via postMessage (structured clone), so normalize them.
  if (value === figma.mixed) return 'mixed';

  // Any Symbol (including `figma.mixed`) is not postMessage-cloneable.
  if (typeof value === 'symbol') return 'mixed';
  if (typeof value === 'function') return '[Function]';

  const valueType = typeof value;

  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForPostMessage(v, seen));
  }

  if (value instanceof Date) return value.toISOString();

  if (valueType === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeForPostMessage(v, seen);
    }
    return out;
  }

  return value;
}

function sendSuccess(result: unknown) {
  const safeResult = sanitizeForPostMessage(result);
  figma.ui.postMessage({
    type: 'Exportion-result',
    data: safeResult
  });
}

/**
 * Send error message to the UI
 */
function sendError(message: string) {
  console.log('[sendError] Sending error to UI:', message);
  figma.ui.postMessage({
    type: 'error',
    message: message
  });
}
