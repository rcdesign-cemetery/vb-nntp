<?php
require_once DIR . '/includes/class_nntpgate_object.php';
abstract class NNTPGate_Index_Base extends NNTPGate_Object
{
    /**
     *
     * @var int
     */
    protected $_group_id = 0;

    /**
     *
     * @var int
     */
    protected $_message_id = 0;

    /**
     *
     * @var int
     */
    protected $_parent_id = null;

    /**
     *
     * @var string
     */
    protected $_title = '';

    /**
     *
     * @var int
     */
    protected $_data_time = TIMENOW;

    /**
     *
     * @var int
     */
    protected $_user_id = null;

    /**
     *
     * @var string
     */
    protected $_deleted = 'no'; //enum('yes', 'no')

    /**
     *
     * @var int
     */
    protected $_post_id = null;

    /**
     *
     * @var int
     */
    protected $_map_id = null;

    /**
     * Get message by forum source (post_id)
     * Received fields defined by $field param
     *
     * @param array $fields
     * @param int $post_id
     * @return bool
     */
    protected function _get_index_by_post($fields, $post_id = null)
    {
        if (is_null($post_id))
        {
            if (is_null($this->_post_id))
            {
                return false;
            }
            $post_id = $this->_post_id;
        }
        if (!is_array($fields) OR empty($fields))
        {
            return false;
        }
        $db_fields = array();
        foreach ($fields as $field_name)
        {
            $db_fields[$field_name] = str_replace('_', '', $field_name);
        }
        if (empty($db_fields))
        {
            return false;
        }

        $sql ="SELECT
                        " . implode( ", ", $db_fields ) . "
                    FROM
                        `" . TABLE_PREFIX . "nntp_index`
                    WHERE
                        `messagetype` = '" . $this->_get_message_type() . "' AND 
                        `postid`      =  " . (int) $this->_post_id . " AND
                        `deleted`     = 'no'
                    LIMIT 1  ";
        $index = $this->_db->query_first($sql);
        if(! empty( $index ) )
        {
            foreach ($index as $field=>$value)
            {
                $prop_name = array_search($field, $db_fields);
                if (property_exists($this, $prop_name))
                {
                    $this->$prop_name = $value;
                }
            }
            return true;
        }
    }

    /**
     * Save/Update message in NNTP storage
     *
     * @return bool
     */
    public function save_message()
    {
        $this->_get_index_by_post(array('_group_id', '_message_id'));
        if (0 == $this->_group_id )
        {
            $this->get_group_id_by_map_id();
        }
        // Just return unless NNTP-group found
        if( 0 == $this->_group_id)
        {
            return false;
        }
        $message_type = $this->_get_message_type();
        $sql = "INSERT INTO
                    `" . TABLE_PREFIX . "nntp_index`
                SET
                    `groupid`    	=  " . $this->_group_id . ",
                    `messageid`  	=  " . $this->_message_id . ",
                    `parentid`      	=  " . $this->_parent_id . ",
                    `userid`      =  " . $this->_user_id . ",
                    `postid`      =  " . $this->_post_id . ",
                    `messagetype` = '" . $message_type . "',
                    `title`       = '" . $this->_title . "',
                    `datetime`    = FROM_UNIXTIME( " . $this->_data_time . " ),
                    `deleted`     = 'no'
                ON DUPLICATE KEY UPDATE
                    `parentid`       =  " . $this->_parent_id . ",
                    `userid`      =  " .  $this->_user_id . ",
                    `postid`      =  " . $this->_post_id . ",
                    `messagetype` = '" . $message_type . "',
                    `title`       = '" . $this->_title . "',
                    `datetime`    = FROM_UNIXTIME( " . $this->_data_time . " ),
                    `deleted`     = 'no'";
        $this->_db->query_write($sql);
        if( !$this->_message_id )
        {
            $this->_message_id = $this->_db->insert_id();
        }
        $this->_cache_message_save();
        return $this->_message_id;
    }

    /**
     * Save message body (it's in separate table, for better speed)
     *
     * @return bool
     */
    protected function _cache_message_save()
    {

        if( empty($this->_group_id) || empty($this->_message_id))
        {
            return false;
        }
        $body = $this->_db->escape_string($this->_make_message_body());

        /*
         *  Save message info to cache
         */
        $sql = "INSERT INTO
                    `" . TABLE_PREFIX . "nntp_cache_messages`
                SET
                    `groupid`   =  " . $this->_group_id . ",
                    `messageid` =  " . $this->_message_id . ",
                    `body`      = '" . $body . "'
                ON DUPLICATE KEY UPDATE
                    `body`      = '" . $body . "'";
        $this->_db->query_write($sql);
        return true;
    }

    /**
     * Build HTML message body for future store.
     *
     * @return string
     */
    abstract protected function _make_message_body();

    /**
     * Get group id by map.
     * 
     * If $map_id messed, then $self::_map_id used
     * $external defines, if result will be duplicated to $self::_group_id
     *
     * @todo the same method exists in NNTPGate_Group_Base.
     * May be we should, delegate or move to separate methos.
     *
     * @param int $map_id
     * @param bool $external
     * @return int
     */
    public function get_group_id_by_map_id($map_id = null, $external = false)
    {
        if (is_null($map_id))
        {
            $map_id = $this->_map_id;
        }
        if ( !$map_id)
        {
            return 0;
        }
        // Find group id by map id
        $group_id = 0;
        $sql = "SELECT `id`
                FROM
                    `" . TABLE_PREFIX . "nntp_groups`
                WHERE
                    `map_id` =  " . $map_id;

        $res = $this->_db->query_first($sql);
        if( !empty( $res ) )
        {
            $group_id = intval($res['id']);
        }

        if ($external)
        {
            return $group_id;
        }
        else
        {
            return $this->_group_id = $group_id;
        }
    }


    /**
     * Must be specified in each child, because php before 5.3 doesn't
     * support constructions like get_class($this)::MESSAGE_TYPE
     *
     * @return string
     */
    abstract protected function _get_message_type();

    /**
     *
     * @param int $value
     */
    public function set_parent_id($value)
    {
        $this->_parent_id = (int)$value;
    }


    /**
     *
     * @param int $value
     */
    public function set_user_id($value)
    {
        $this->_user_id = (int)$value;
    }

    /**
     *
     * @param string $value
     */
    public function set_title($value)
    {
        $this->_title = $this->_db->escape_string($value);
    }

    /**
     *
     * @param int $value
     */
    public function set_post_id($value)
    {
        $this->_post_id = (int)$value;
    }

    /**
     *
     * @access public
     * @param int $value
     */
    public function set_map_id($value)
    {
        $this->_map_id = (int)$value;
    }

    /**
     * Delete all messages by parent id (for example, by topic id)
     *
     * @param int $parent_id
     * @return bool
     */
    public function delete_message_by_parent_id($parent_id = 0 )
    {
        if (!$parent_id)
        {
            $parent_id = $this->_parent_id;
        }
        if( !$parent_id )
        {
            return false;
        }
        // mark messages in index as deleted
        $sql = "UPDATE
                    `" . TABLE_PREFIX . "nntp_index`
                SET
                    `deleted` = 'yes'
                WHERE
                    `messagetype` = '" . $this->_get_message_type() . "' AND
                    `parentid`   = " . intval( $parent_id );
        $this->_db->query_write($sql);
        return true;
    }

    /**
     * Delete posts by src ids list (for example, by forum posd ids)
     *
     * @param array $post_id_list
     * @return bool
     */
    public function delete_messages_by_post_id_list ($post_id_list )
    {
        if( empty( $post_id_list ) )
        {
            return false;
        }

        $post_id_list = array_map('intval', $post_id_list);
        // mark messages in index as deleted
        $sql = "UPDATE
                    `" . TABLE_PREFIX . "nntp_index`
                SET
                    `deleted` = 'yes'
                WHERE
                    `messagetype` = '" . $this->_get_message_type() . "' AND
                    `postid` IN( '" . implode( "', '", $post_id_list ) . "' )";
        $this->_db->query_write($sql);
        return true;
    }

    /**
     * Delete single post by self::_post_id
     *
     * @access public
     * @return bool
     */
    public function delete_message_by_post_id()
    {
        $post_id_list = array($this->_post_id);
        return $this->delete_messages_by_post_id_list($post_id_list);
    }

    /**
     * Move messages by parent id
     * 
     * @todo (!) thread copy not supported
     *
     * @param int $target_group_id
     * @param int $parent_id
     * @return bool
     */
    public function move_posts_by_parent_id($target_group_id, $parent_id)
    {
        if (!$this->_group_id)
        {
            $this->get_group_id_by_map_id();
        }
        if (!$this->_group_id OR  (!$parent_id) )
        {
            return false;
        }
        $this->_parent_id = $parent_id;
        
        // if target has no nntp group, then just delete
        if ( (!$target_group_id))
        {
            return $this->delete_message_by_parent_id();
        }

        // Select all messages and move one-by-one
        $sql = "SELECT
                    `messageid`,
					`postid`
                FROM
                    `" . TABLE_PREFIX . "nntp_index`
				WHERE
                    `groupid`   = " . $this->_group_id . " AND
					`parentid`   = " . $this->_parent_id;
        $res = $this->_db->query_read_slave($sql);
        while( $index_info = $this->_db->fetch_array( $res ))
        {
            $this->set_post_id($index_info['postid']);
            $this->move_post($target_group_id, $index_info['messageid']);
        }
        return true;
    }

    /**
     * Move messages by src ids list (for example, by forum post ids)
     * 
     * @todo (!) Copy not supported
     *
     * @param int $target_group_id
     * @param array $post_id_list
     * @return bool
     */
    public function move_posts_by_id_list($target_group_id, $post_id_list)
    {
        if (!$this->_group_id)
        {
            $this->get_group_id_by_map_id();
        }
        if ( empty($post_id_list)  OR (!$this->_group_id))
        {
            return false;
        }
        
        // if target has no nntp group, then just delete
        if ((!$target_group_id))
        {
            return $this->delete_messages_by_post_id_list($post_id_list);
        }
        $post_id_list = array_map('intval', $post_id_list);
        $sql = "SELECT
                    `messageid`,
					`postid`
                FROM
                    `" . TABLE_PREFIX . "nntp_index`
				WHERE
                    `groupid`   = " . $this->_group_id . " AND
					`messagetype` = '" . $this->_get_message_type() . "' AND
                    `postid` IN( '" . implode( "', '", $post_id_list ) . "' )";
       
        $res = $this->_db->query_read_slave($sql);
        while( $index_info = $this->_db->fetch_array( $res ))
        {
            $this->set_post_id($index_info['postid']);
            $this->move_post($target_group_id, (int)$index_info['messageid']);
        }
        return true;
    }

    /**
     * Move single message
     * 
     * @todo (!) Copy not supported
     * 
     * @param int $target_group_id
     * @param int $message_id
     * @return bool
     */
    public function move_post($target_group_id, $message_id)
    {
        if ( (!$target_group_id) OR empty($message_id) )
        {
            return false;
        }
        
        // move only 'active' messages, skip deleted
        $sql = "SELECT
					*
                FROM
                    `" . TABLE_PREFIX . "nntp_index`
                WHERE
                    `groupid`   = " . $this->_group_id . " AND
                    `deleted`   = 'no' AND
                    `messageid` = " . $message_id;
        $index_info = $this->_db->query_first($sql);
        if (!empty($index_info))
        {
            $this->delete_message_by_post_id();
            unset($index_info['messageid']);
            $index_info['groupid'] = $target_group_id;
            $fields = array();
            foreach ($index_info as $field_name=>$value)
            {
                $fields[] = $field_name .' = \''.$value.'\'';
            }
            $sql = "INSERT INTO
                        `" . TABLE_PREFIX . "nntp_index`
                    SET
                        " . implode(", \n", $fields);
            $this->_db->query_write($sql);
            $new_message_id = $this->_db->insert_id();

            $sql = "UPDATE
                		`" . TABLE_PREFIX . "nntp_cache_messages`
                    SET
                        `groupid` = " . $target_group_id . ",
                        `messageid` =  " . $new_message_id . "
                    WHERE
                        `groupid`   = " . $this->_group_id . " AND
                		`messageid` = " . $message_id;
            $this->_db->query_write($sql);
            return true;
        }
        return false;
    }
 }
